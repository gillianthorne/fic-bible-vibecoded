// Creating works, chapters and scenes: rows plus empty folders and files.
// Needs the Electron-built SQLite module: run through `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openSqlite } from '../src/main/sqlite.js'
import { migrate } from '../src/main/migrate.js'
import { importLibrary } from '../src/main/import.js'
import { createChapter, createCharacter, createScene, createWork } from '../src/main/create.js'
import { createHandlers } from '../src/main/handlers.js'

const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url))

function setup() {
  const db = openSqlite(':memory:')
  migrate(db, MIGRATIONS)
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fic-bible-create-')))
  return { db, root }
}

const count = (db, table) => db.prepare(`SELECT count(*) FROM ${table}`).pluck().get()

test('creates a work folder, ##-title chapter folders and empty ##-title.md scenes, in order', () => {
  const { db, root } = setup()
  const workId = createWork(db, root, '  Salt and Static ')
  assert.deepEqual(db.prepare('SELECT title, folder FROM works').get(), { title: 'Salt and Static', folder: 'Salt and Static' })
  assert.ok(fs.statSync(path.join(root, 'Salt and Static')).isDirectory())
  assert.deepEqual(fs.readdirSync(path.join(root, 'Salt and Static')).sort(), ['chapters', 'characters', 'notes'])

  const one = createChapter(db, root, workId, 'Signal')
  const two = createChapter(db, root, workId, 'The Tide Tables')
  assert.deepEqual(
    db.prepare('SELECT number, title, folder, status FROM chapters ORDER BY number').all(),
    [
      { number: 1, title: 'Signal', folder: '01-Signal', status: 'drafting' },
      { number: 2, title: 'The Tide Tables', folder: '02-The Tide Tables', status: 'drafting' }
    ]
  )

  createScene(db, root, one, 'First')
  createScene(db, root, one, 'Second')
  createScene(db, root, two, 'Elsewhere')
  assert.deepEqual(
    db.prepare('SELECT position, title, filename, pov, status FROM scenes WHERE chapter_id = ? ORDER BY position').all(one),
    [
      { position: 1, title: 'First', filename: '01-First.md', pov: '', status: 'outlined' },
      { position: 2, title: 'Second', filename: '02-Second.md', pov: '', status: 'outlined' }
    ]
  )
  const file = path.join(root, 'Salt and Static', 'chapters', '01-Signal', '02-Second.md')
  assert.equal(fs.readFileSync(file, 'utf8'), '')
})

test('numbers continue from the highest, padded to two digits until 100', () => {
  const { db, root } = setup()
  const workId = createWork(db, root, 'W')
  db.prepare("INSERT INTO chapters (work_id, number, title, folder) VALUES (?, 99, 'Late', '99-Late')").run(workId)
  fs.mkdirSync(path.join(root, 'W', 'chapters', '99-Late'))
  const id = createChapter(db, root, workId, 'Next')
  assert.equal(db.prepare('SELECT folder FROM chapters WHERE id = ?').pluck().get(id), '100-Next')
})

test('a re-import finds everything created and adds nothing', () => {
  const { db, root } = setup()
  const workId = createWork(db, root, 'W')
  const ch = createChapter(db, root, workId, 'One')
  createScene(db, root, ch, 'Scene')
  createChapter(db, root, workId, 'Empty chapter')
  const result = importLibrary(db, root)
  assert.deepEqual(result.added, { works: 0, chapters: 0, scenes: 0, characters: 0 })
  assert.deepEqual(result.skipped, [])
})

test('titles that cannot be file names are refused, and nothing is created', () => {
  const { db, root } = setup()
  for (const [title, message] of [
    ['', /blank/],
    ['   ', /blank/],
    ['a/b', /contain “\/”/],
    ['a\\b', /contain “\\”/],
    ['Why?', /contain “\?”/],
    ['Act: One', /contain “:”/],
    ['tab\there', /control characters/],
    ['Trailing.', /end with a dot/],
    ['.hidden', /start with a dot/],
    ['CON', /reserves/],
    ['nul.txt', /reserves/],
    [5, /must be text/]
  ]) {
    assert.throws(() => createWork(db, root, title), message, JSON.stringify(title))
  }
  assert.equal(count(db, 'works'), 0)
  assert.deepEqual(fs.readdirSync(root), [])
  // "CON" is only reserved as a whole name: 01-CON is fine for a chapter.
  const workId = createWork(db, root, 'W')
  createChapter(db, root, workId, 'CON')
  assert.ok(fs.existsSync(path.join(root, 'W', 'chapters', '01-CON')))
})

test('a name already on disk, in any case, is refused and left untouched', () => {
  const { db, root } = setup()
  fs.mkdirSync(path.join(root, 'Existing Work'))
  fs.writeFileSync(path.join(root, 'Existing Work', 'keep.txt'), 'mine')
  assert.throws(() => createWork(db, root, 'existing work'), /already exists on disk/)
  assert.equal(count(db, 'works'), 0)
  assert.equal(fs.readFileSync(path.join(root, 'Existing Work', 'keep.txt'), 'utf8'), 'mine')
})

test('a number already used on disk by something not imported is refused', () => {
  const { db, root } = setup()
  const workId = createWork(db, root, 'W')
  fs.mkdirSync(path.join(root, 'W', 'chapters', '01-Not imported yet'))
  assert.throws(() => createChapter(db, root, workId, 'New'), /already a chapter 1 on disk \(“01-Not imported yet”\)/)
  assert.equal(count(db, 'chapters'), 0)

  db.prepare("INSERT INTO chapters (work_id, number, title, folder) VALUES (?, 1, 'Not imported yet', '01-Not imported yet')").run(workId)
  const chapterId = db.prepare('SELECT id FROM chapters').pluck().get()
  const stray = path.join(root, 'W', 'chapters', '01-Not imported yet', '01-Draft.md')
  fs.writeFileSync(stray, 'words already here')
  assert.throws(() => createScene(db, root, chapterId, 'Draft'), /already exists on disk/)
  assert.throws(() => createScene(db, root, chapterId, 'Other'), /already a scene 1 on disk/)
  assert.equal(fs.readFileSync(stray, 'utf8'), 'words already here')
  assert.equal(count(db, 'scenes'), 0)
})

test('if the parent folder is missing on disk, the row is rolled back', () => {
  const { db, root } = setup()
  const workId = createWork(db, root, 'W')
  const chapterId = createChapter(db, root, workId, 'One')
  fs.rmSync(path.join(root, 'W'), { recursive: true })
  assert.throws(() => createScene(db, root, chapterId, 'S'), /chapter folder is missing on disk/)
  assert.throws(() => createChapter(db, root, workId, 'Two'), /work’s chapters folder is missing on disk/)
  assert.equal(count(db, 'scenes'), 0)
  assert.equal(count(db, 'chapters'), 1)
})

test('unknown or bad parent ids are refused', () => {
  const { db, root } = setup()
  assert.throws(() => createChapter(db, root, 99, 'X'), /Work 99 not found/)
  assert.throws(() => createScene(db, root, 99, 'X'), /Chapter 99 not found/)
  assert.throws(() => createChapter(db, root, '1', 'X'), /Work id must be a positive integer/)
})

test('handlers return the new id, or the error', () => {
  const { db, root } = setup()
  const handlers = createHandlers(() => ({ db, libraryRoot: root }))
  const work = handlers['work:create']('W')
  assert.equal(work.ok, true)
  const chapter = handlers['chapter:create'](work.data, 'One')
  const scene = handlers['scene:create'](chapter.data, 'S')
  assert.equal(db.prepare('SELECT title FROM scenes WHERE id = ?').pluck().get(scene.data), 'S')
  assert.deepEqual(handlers['work:create']('a/b'), { ok: false, error: 'Title can’t contain “/”: it becomes a file name' })
})

test('a character is a row and an empty notes file in the work’s characters folder', () => {
  const { db, root } = setup()
  const workId = createWork(db, root, 'Hockey AU')
  const id = createCharacter(db, root, workId, '  Marie-Philip ')
  assert.deepEqual(db.prepare('SELECT name, age, birthday, filename FROM characters WHERE id = ?').get(id), {
    name: 'Marie-Philip', age: '', birthday: '', filename: 'Marie-Philip.md'
  })
  assert.equal(fs.readFileSync(path.join(root, 'Hockey AU', 'characters', 'Marie-Philip.md'), 'utf8'), '')
  // A re-import recognises it.
  assert.deepEqual(importLibrary(db, root).added, { works: 0, chapters: 0, scenes: 0, characters: 0 })
})

test('a character’s name already taken on disk, in any case, is refused and the file left alone', () => {
  const { db, root } = setup()
  const workId = createWork(db, root, 'W')
  const mine = path.join(root, 'W', 'characters', 'Marie.md')
  fs.writeFileSync(mine, 'my notes')
  assert.throws(() => createCharacter(db, root, workId, 'marie'), /already exists on disk/)
  assert.equal(fs.readFileSync(mine, 'utf8'), 'my notes')
  assert.equal(count(db, 'characters'), 0)
  for (const [name, message] of [['', /Name can’t be blank/], ['A/B', /contain “\/”/], ['.x', /start with a dot/], ['aux', /reserves/]]) {
    assert.throws(() => createCharacter(db, root, workId, name), message, name)
  }
  assert.equal(count(db, 'characters'), 0)
})

test('a work made before v2 gets its characters folder when its first character is made', () => {
  const { db, root } = setup()
  fs.mkdirSync(path.join(root, 'Old'))
  const workId = db.prepare("INSERT INTO works (title, folder) VALUES ('Old', 'Old')").run().lastInsertRowid
  createCharacter(db, root, Number(workId), 'Ana')
  assert.ok(fs.existsSync(path.join(root, 'Old', 'characters', 'Ana.md')))
  fs.rmSync(path.join(root, 'Old'), { recursive: true })
  assert.throws(() => createCharacter(db, root, Number(workId), 'Bo'), /work folder is missing on disk/)
  assert.equal(count(db, 'characters'), 1)
})
