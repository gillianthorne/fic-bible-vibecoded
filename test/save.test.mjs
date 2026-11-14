// Saving from the prose editor: the one write to a file with content.
// Needs the Electron-built SQLite module: run through `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openSqlite } from '../src/main/sqlite.js'
import { migrate } from '../src/main/migrate.js'
import { createChapter, createScene, createWork } from '../src/main/create.js'
import { createHandlers } from '../src/main/handlers.js'
import { decodeScene, encodeScene, hashBytes, readSceneSource, saveSceneSource } from '../src/main/save.js'

const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url))

// A library with one empty scene. Returns its id and file path.
function setup() {
  const db = openSqlite(':memory:')
  migrate(db, MIGRATIONS)
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fic-bible-save-')))
  const workId = createWork(db, root, 'Salt')
  const chapterId = createChapter(db, root, workId, 'Signal')
  const sceneId = createScene(db, root, chapterId, 'First')
  const file = path.join(root, 'Salt', '01-Signal', '01-First.md')
  return { db, root, sceneId, file, dir: path.dirname(file) }
}

const open = ({ db, root, sceneId }) => readSceneSource(db, root, sceneId)
const save = ({ db, root, sceneId }, text, hash) => saveSceneSource(db, root, sceneId, text, hash)

test('decode and encode keep CRLF, LF and a BOM', () => {
  const crlf = Buffer.from('﻿One\r\ntwo\r\n\r\nThree', 'utf8')
  const decoded = decodeScene(crlf)
  assert.deepEqual({ ...decoded, hash: undefined }, { text: 'One\ntwo\n\nThree', eol: '\r\n', bom: true, hash: undefined })
  assert.ok(encodeScene(decoded.text, decoded).equals(crlf))

  const lf = Buffer.from('One\n\nTwo\n', 'utf8')
  assert.ok(encodeScene(decodeScene(lf).text, decodeScene(lf)).equals(lf))
  assert.equal(decodeScene(Buffer.alloc(0)).eol, '\n')
})

test('a mixed file takes its majority line ending', () => {
  assert.equal(decodeScene(Buffer.from('a\r\nb\r\nc\nd', 'utf8')).eol, '\r\n')
  assert.equal(decodeScene(Buffer.from('a\nb\nc\r\nd', 'utf8')).eol, '\n')
})

test('opens, saves, and saves again with the new hash', () => {
  const s = setup()
  const opened = open(s)
  assert.equal(opened.text, '')
  assert.equal(opened.fileError, null)

  const first = save(s, 'She said **nothing**.\n\nThen *waited*.', opened.hash)
  assert.equal(first.written, true)
  assert.equal(fs.readFileSync(s.file, 'utf8'), 'She said **nothing**.\n\nThen *waited*.')

  const second = save(s, 'Changed.', first.hash)
  assert.equal(second.written, true)
  assert.equal(fs.readFileSync(s.file, 'utf8'), 'Changed.')
  assert.equal(second.hash, hashBytes(fs.readFileSync(s.file)))
})

test('saving over a CRLF file with a BOM keeps both', () => {
  const s = setup()
  fs.writeFileSync(s.file, '﻿One\r\n\r\nTwo')
  const opened = open(s)
  assert.equal(opened.text, 'One\n\nTwo')
  save(s, 'One\n\nTwo\n\nThree', opened.hash)
  assert.equal(fs.readFileSync(s.file, 'utf8'), '﻿One\r\n\r\nTwo\r\n\r\nThree')
})

test('unchanged text writes nothing, even in a mixed file', () => {
  const s = setup()
  fs.writeFileSync(s.file, 'a\r\nb\nc')
  const before = fs.statSync(s.file).mtimeMs
  const opened = open(s)
  assert.deepEqual(save(s, opened.text, opened.hash), { hash: opened.hash, written: false })
  assert.equal(fs.readFileSync(s.file, 'utf8'), 'a\r\nb\nc')
  assert.equal(fs.statSync(s.file).mtimeMs, before)
})

test('refuses to save over a file that changed on disk, and leaves it alone', () => {
  const s = setup()
  const opened = open(s)
  fs.writeFileSync(s.file, 'Written in another editor.')
  assert.throws(() => save(s, 'From the app.', opened.hash), /changed on disk/)
  assert.equal(fs.readFileSync(s.file, 'utf8'), 'Written in another editor.')
})

test('refuses to recreate a file that was deleted', () => {
  const s = setup()
  const opened = open(s)
  fs.rmSync(s.file)
  assert.throws(() => save(s, 'Text', opened.hash), /gone from disk/)
  assert.equal(fs.existsSync(s.file), false)
})

test('leaves no temporary files behind', () => {
  const s = setup()
  save(s, 'Text', open(s).hash)
  assert.deepEqual(fs.readdirSync(s.dir), ['01-First.md'])
})

test('a failed save leaves the old file whole and no temporary file', () => {
  const s = setup()
  fs.writeFileSync(s.file, 'Original.')
  const opened = open(s)
  // Make the final rename fail, as a disk error would.
  const realRename = fs.renameSync
  fs.renameSync = () => {
    throw Object.assign(new Error('simulated'), { code: 'EIO' })
  }
  try {
    assert.throws(() => save(s, 'New text', opened.hash), /simulated/)
  } finally {
    fs.renameSync = realRename
  }
  assert.equal(fs.readFileSync(s.file, 'utf8'), 'Original.')
  assert.deepEqual(fs.readdirSync(s.dir), ['01-First.md'])
})

test('a file that is not UTF-8 opens with an error and no text', () => {
  const s = setup()
  fs.writeFileSync(s.file, Buffer.from([0x66, 0xff, 0xfe, 0x66]))
  const opened = open(s)
  assert.equal(opened.text, null)
  assert.match(opened.fileError, /UTF-8/)
})

test('handlers: null for an unknown scene, errors as ok: false, bad ids refused', () => {
  const s = setup()
  const handlers = createHandlers(() => ({ db: s.db, libraryRoot: s.root }))
  assert.deepEqual(handlers['scene:source'](999999), { ok: true, data: null })
  assert.match(handlers['scene:source']('1').error, /sceneId must be a positive integer/)
  assert.match(handlers['scene:save'](s.sceneId, 'x', 'not-the-hash').error, /changed on disk/)
  assert.match(handlers['scene:save'](s.sceneId, 42, 'h').error, /must be a string/)
  assert.match(handlers['scene:save'](999999, 'x', 'h').error, /no longer exists/)
  const opened = handlers['scene:source'](s.sceneId).data
  assert.deepEqual(handlers['scene:save'](s.sceneId, 'Saved.', opened.hash).data.written, true)
})
