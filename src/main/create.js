import fs from 'node:fs'
import path from 'node:path'
import { WORK_FOLDERS, chapterDir, chaptersDir } from './paths.js'

// Creating works, chapters and scenes: a database row plus an empty folder
// or an empty scene file. No Electron imports, so these are tested with
// plain `node --test`.
//
// The write boundary (docs/spec.md, File handling): the app may create an
// empty folder for a new work or chapter, and an empty file for a new
// scene. Nothing here writes to, renames, moves or deletes anything that
// already exists:
// - folders are made with mkdirSync without `recursive`, which fails if
//   the folder exists
// - scene files are opened with the 'wx' flag, which fails if the file
//   exists
// - before either, a name already in the parent folder (in any case, as
//   Windows sees it) or a chapter or scene number already used there is
//   refused, so a folder not yet imported is never doubled up
//
// Names follow the import layout (import.js), so a re-import recognises
// them: a work's folder is its title, a chapter is ##-title, a scene is
// ##-title.md. New chapters and scenes always go at the end.
//
// The row is inserted first, inside a transaction, and the folder or file
// is created last: if that fails, the transaction rolls the row back.

// Windows can't hold these in a file name; refusing them everywhere keeps
// a library usable on both machines.
const BAD_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f]/
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

function requireId(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer, got ${JSON.stringify(value)}`)
  }
  return value
}

// A title that can stand as (part of) a file or folder name, trimmed.
export function checkTitle(value) {
  if (typeof value !== 'string') throw new Error('Title must be text')
  const title = value.trim()
  if (title === '') throw new Error('Title can’t be blank')
  const bad = title.match(BAD_CHARACTERS)
  if (bad) {
    const shown = bad[0] < ' ' ? 'control characters' : `“${bad[0]}”`
    throw new Error(`Title can’t contain ${shown}: it becomes a file name`)
  }
  if (title.endsWith('.')) throw new Error('Title can’t end with a dot: it becomes a file name')
  return title
}

// Two digits, as the library's names are: 4 -> "04", 12 -> "12".
const numbered = (n, title) => `${String(n).padStart(2, '0')}-${title}`

const NUMBER_PREFIX = /^(\d+)-/

// Refuses a name that's already in `dir` (compared without case), or, if
// `number` is given, a ##- name in `dir` with that number. A missing dir
// is left for the create itself to report.
function refuseTaken(dir, name, number, what) {
  let entries
  try {
    entries = fs.readdirSync(dir)
  } catch (e) {
    if (e.code === 'ENOENT') return
    throw e
  }
  const lower = name.toLowerCase()
  const same = entries.find((e) => e.toLowerCase() === lower)
  if (same) throw new Error(`“${same}” already exists on disk. Re-import the library to bring it in.`)
  if (number !== undefined) {
    const clash = entries.find((e) => Number(NUMBER_PREFIX.exec(e)?.[1]) === number)
    if (clash) {
      throw new Error(`There’s already a ${what} ${number} on disk (“${clash}”). Re-import the library to bring it in.`)
    }
  }
}

function missingParent(e, what) {
  if (e.code === 'ENOENT') return new Error(`The ${what} folder is missing on disk, so nothing was created.`)
  return e
}

// A new work: a folder named for its title at the library root, holding
// its three empty folders (characters, notes, chapters). Returns the new
// work's id.
export function createWork(db, libraryRoot, title) {
  const name = checkTitle(title)
  if (name.startsWith('.')) throw new Error('Title can’t start with a dot: import skips hidden folders')
  if (RESERVED.test(name)) throw new Error(`“${name}” is a name Windows reserves; choose another title`)
  refuseTaken(libraryRoot, name)
  return db.transaction(() => {
    const info = db.prepare('INSERT INTO works (title, folder) VALUES (?, ?)').run(name, name)
    const workDir = path.join(libraryRoot, name)
    fs.mkdirSync(workDir)
    for (const sub of WORK_FOLDERS) fs.mkdirSync(path.join(workDir, sub))
    return Number(info.lastInsertRowid)
  })()
}

// A new chapter at the end of its work: the next number, in a ##-title
// folder inside the work's chapters folder. Returns the new chapter's id.
export function createChapter(db, libraryRoot, workId, title) {
  const work = db.prepare('SELECT id, folder FROM works WHERE id = ?').get(requireId(workId, 'Work id'))
  if (!work) throw new Error(`Work ${workId} not found`)
  const name = checkTitle(title)
  return db.transaction(() => {
    const number = db.prepare('SELECT coalesce(max(number), 0) + 1 FROM chapters WHERE work_id = ?').pluck().get(work.id)
    const folder = numbered(number, name)
    const dir = chaptersDir(libraryRoot, work.folder)
    refuseTaken(dir, folder, number, 'chapter')
    const info = db
      .prepare('INSERT INTO chapters (work_id, number, title, folder) VALUES (?, ?, ?, ?)')
      .run(work.id, number, name, folder)
    try {
      fs.mkdirSync(path.join(dir, folder))
    } catch (e) {
      throw missingParent(e, 'work’s chapters')
    }
    return Number(info.lastInsertRowid)
  })()
}

// A new scene at the end of its chapter: the next position, in an empty
// ##-title.md file. Returns the new scene's id.
export function createScene(db, libraryRoot, chapterId, title) {
  const chapter = db
    .prepare(
      `SELECT c.id, c.folder, w.folder AS workFolder
       FROM chapters c JOIN works w ON w.id = c.work_id WHERE c.id = ?`
    )
    .get(requireId(chapterId, 'Chapter id'))
  if (!chapter) throw new Error(`Chapter ${chapterId} not found`)
  const name = checkTitle(title)
  return db.transaction(() => {
    const position = db.prepare('SELECT coalesce(max(position), 0) + 1 FROM scenes WHERE chapter_id = ?').pluck().get(chapter.id)
    const filename = `${numbered(position, name)}.md`
    const dir = chapterDir(libraryRoot, chapter.workFolder, chapter.folder)
    refuseTaken(dir, filename, position, 'scene')
    const info = db
      .prepare(`INSERT INTO scenes (chapter_id, position, title, filename, pov) VALUES (?, ?, ?, ?, '')`)
      .run(chapter.id, position, name, filename)
    try {
      fs.writeFileSync(path.join(dir, filename), '', { flag: 'wx' })
    } catch (e) {
      throw missingParent(e, 'chapter')
    }
    return Number(info.lastInsertRowid)
  })()
}
