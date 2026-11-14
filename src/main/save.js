import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { scenePath } from './paths.js'

// Reading a scene file for the prose editor, and saving it back. No
// Electron imports, so these are tested with plain `node --test`.
//
// Saving is the one write the app makes to a file that has content
// (docs/spec.md, File handling). The guards:
// - only the scene's own file, as its row names it, is written
// - the editor sends back the hash of the bytes it was given; if the file
//   on disk no longer has that hash (another editor, a sync client), the
//   save is refused and nothing is written
// - the new text goes to a temporary file beside the scene, which is then
//   renamed over the original, so a failed save leaves the old file whole
// - line endings and any byte-order mark are put back as the file had them
// - text that hasn't changed writes nothing
//
// The editor works on text with LF line endings and no BOM, which is what
// CodeMirror holds internally; decodeScene and encodeScene convert.

const BOM = '﻿'
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

export const hashBytes = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')

// A file's bytes as editor text, plus what's needed to write it back the
// same way. eol is the file's line ending: '\r\n' if most of its line
// breaks are CRLF, otherwise '\n' (an empty or one-line file is LF). A
// file that mixes the two is saved with whichever it uses most. Throws on
// bytes that aren't UTF-8, which the editor can't round-trip.
export function decodeScene(bytes) {
  let raw
  try {
    raw = utf8.decode(bytes)
  } catch {
    throw new Error('The scene file isn’t UTF-8 text, so it can’t be edited here.')
  }
  const bom = raw.startsWith(BOM)
  const body = bom ? raw.slice(1) : raw
  const crlf = (body.match(/\r\n/g) ?? []).length
  const lf = (body.match(/\n/g) ?? []).length - crlf
  return {
    text: body.replace(/\r\n?/g, '\n'),
    eol: crlf > lf ? '\r\n' : '\n',
    bom,
    hash: hashBytes(bytes)
  }
}

// Editor text back to file bytes, with the file's line endings and BOM.
export function encodeScene(text, { eol, bom }) {
  const body = text.replace(/\r\n?/g, '\n')
  return Buffer.from((bom ? BOM : '') + (eol === '\r\n' ? body.replace(/\n/g, '\r\n') : body), 'utf8')
}

function requireId(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer, got ${JSON.stringify(value)}`)
  }
  return value
}

// The scene's row and file path, or null for an unknown scene.
function findScene(db, libraryRoot, sceneId) {
  const scene = db
    .prepare(
      `SELECT s.id, s.title, s.filename,
              c.id AS chapterId, c.number AS chapterNumber, c.title AS chapterTitle, c.folder AS chapterFolder,
              w.id AS workId, w.title AS workTitle, w.folder AS workFolder
       FROM scenes s
       JOIN chapters c ON c.id = s.chapter_id
       JOIN works w ON w.id = c.work_id
       WHERE s.id = ?`
    )
    .get(requireId(sceneId, 'sceneId'))
  if (!scene) return null
  return { ...scene, file: scenePath(libraryRoot, scene.workFolder, scene.chapterFolder, scene.filename) }
}

// What the editor opens: the scene's text and the hash to send back on
// save. null for an unknown scene. A file that can't be read or decoded
// gives text: null plus fileError, and can't be edited.
export function readSceneSource(db, libraryRoot, sceneId) {
  const scene = findScene(db, libraryRoot, sceneId)
  if (!scene) return null
  const base = {
    id: scene.id,
    title: scene.title,
    filename: scene.filename,
    path: scene.file,
    chapter: { id: scene.chapterId, number: scene.chapterNumber, title: scene.chapterTitle },
    work: { id: scene.workId, title: scene.workTitle }
  }
  let bytes
  try {
    bytes = fs.readFileSync(scene.file)
  } catch (e) {
    return { ...base, text: null, hash: null, fileError: e.code ?? e.message }
  }
  try {
    const { text, hash } = decodeScene(bytes)
    return { ...base, text, hash, fileError: null }
  } catch (e) {
    return { ...base, text: null, hash: null, fileError: e.message }
  }
}

// Windows refuses a rename while another program (a sync client, a virus
// scanner) briefly holds the file. Those clear quickly, so try again a few
// times before giving up.
const BUSY = new Set(['EPERM', 'EBUSY', 'EACCES'])
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

function renameOver(from, to) {
  for (let attempt = 1; ; attempt++) {
    try {
      fs.renameSync(from, to)
      return
    } catch (e) {
      if (attempt >= 5 || !BUSY.has(e.code)) throw e
      pause(100)
    }
  }
}

// Writes bytes to a new temporary file beside `file`, flushed to disk,
// then renames it over `file`. The temporary name doesn't end in .md, so
// an import never mistakes one for a scene. If anything fails, the
// temporary file is removed and `file` is as it was.
function replaceFile(file, bytes, mode) {
  const dir = path.dirname(file)
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}-${Date.now()}.tmp`)
  let fd = null
  try {
    fd = fs.openSync(tmp, 'wx', mode)
    fs.writeSync(fd, bytes)
    fs.fsyncSync(fd)
    fs.closeSync(fd)
    fd = null
    renameOver(tmp, file)
  } catch (e) {
    if (fd !== null) fs.closeSync(fd)
    fs.rmSync(tmp, { force: true })
    throw e
  }
}

// Saves editor text over the scene's file. baseHash is the hash the
// editor was given when it opened (or last saved) the file. Returns the
// new hash, which the editor sends with its next save, and whether
// anything was written.
export function saveSceneSource(db, libraryRoot, sceneId, text, baseHash) {
  if (typeof text !== 'string') throw new Error('Scene text must be a string')
  if (typeof baseHash !== 'string' || baseHash === '') throw new Error('Missing the hash of the file as it was opened')
  const scene = findScene(db, libraryRoot, sceneId)
  if (!scene) throw new Error('That scene no longer exists.')

  let current
  try {
    current = fs.readFileSync(scene.file)
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error(`The scene file is gone from disk (${scene.filename}). Nothing was saved.`)
    throw e
  }
  if (hashBytes(current) !== baseHash) {
    throw new Error(
      'The scene file has changed on disk since the editor opened it, so it wasn’t saved over. ' +
        'Copy anything you want to keep, then reopen the editor to see the file as it is now.'
    )
  }

  // Compared as editor text, so a file with mixed line endings isn't
  // rewritten just by being opened and saved.
  const decoded = decodeScene(current)
  if (text.replace(/\r\n?/g, '\n') === decoded.text) return { hash: baseHash, written: false }
  const bytes = encodeScene(text, decoded)
  replaceFile(scene.file, bytes, fs.statSync(scene.file).mode)
  return { hash: hashBytes(bytes), written: true }
}
