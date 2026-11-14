// Importing a library folder. Needs the Electron-built SQLite module:
// run through `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openSqlite } from '../src/main/sqlite.js'
import { migrate } from '../src/main/migrate.js'
import { deleteWorks, importLibrary, scanLibrary, worksMissingFrom } from '../src/main/import.js'

const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url))

function freshDb() {
  const db = openSqlite(':memory:')
  migrate(db, MIGRATIONS)
  return db
}

// Builds a library from { 'work/01-ch/01-scene.md': 'text', 'work/01-ch/': null }.
// A key ending in a separator is an empty folder.
function makeLibrary(files) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fic-bible-import-')))
  for (const [rel, text] of Object.entries(files)) {
    const parts = rel.split('/').filter(Boolean)
    const full = path.join(root, ...parts)
    if (rel.endsWith('/')) fs.mkdirSync(full, { recursive: true })
    else {
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, text)
    }
  }
  return root
}

// Every file under root with its contents, to prove the import wrote nothing.
function snapshot(root) {
  const out = {}
  for (const name of fs.readdirSync(root, { recursive: true })) {
    const full = path.join(root, name)
    out[name] = fs.statSync(full).isDirectory() ? '<dir>' : fs.readFileSync(full, 'utf8')
  }
  return out
}

const reasonFor = (skipped, ...segments) => skipped.find((s) => s.path === path.join(...segments))?.reason

test('maps folders and ##-title names to works, chapters and scenes', () => {
  const root = makeLibrary({
    'Ash and Iron/01-The Gate/01-arrival.md': 'One two three.',
    'Ash and Iron/01-The Gate/02-the argument.md': '',
    'Ash and Iron/02-Smoke/': null,
    'Second Work/': null
  })
  const db = freshDb()
  const result = importLibrary(db, root)

  assert.deepEqual(result.added, { works: 2, chapters: 2, scenes: 2 })
  assert.deepEqual(result.skipped, [])

  const rows = db
    .prepare(
      `SELECT w.title AS work, w.folder AS workFolder, c.number, c.title AS chapter, c.folder, c.status AS chapterStatus,
              s.position, s.title AS scene, s.filename, s.pov, s.status
       FROM works w LEFT JOIN chapters c ON c.work_id = w.id LEFT JOIN scenes s ON s.chapter_id = c.id
       ORDER BY w.title, c.number, s.position`
    )
    .all()
  assert.deepEqual(rows, [
    { work: 'Ash and Iron', workFolder: 'Ash and Iron', number: 1, chapter: 'The Gate', folder: '01-The Gate',
      chapterStatus: 'drafting', position: 1, scene: 'arrival', filename: '01-arrival.md', pov: '', status: 'outlined' },
    { work: 'Ash and Iron', workFolder: 'Ash and Iron', number: 1, chapter: 'The Gate', folder: '01-The Gate',
      chapterStatus: 'drafting', position: 2, scene: 'the argument', filename: '02-the argument.md', pov: '', status: 'outlined' },
    { work: 'Ash and Iron', workFolder: 'Ash and Iron', number: 2, chapter: 'Smoke', folder: '02-Smoke',
      chapterStatus: 'drafting', position: null, scene: null, filename: null, pov: null, status: null },
    { work: 'Second Work', workFolder: 'Second Work', number: null, chapter: null, folder: null,
      chapterStatus: null, position: null, scene: null, filename: null, pov: null, status: null }
  ])
})

test('the title is everything after ##-, kept as written', () => {
  const root = makeLibrary({ 'W/007-Part-two, the  return/12-a-b-c.md': '' })
  const { works } = scanLibrary(root)
  assert.equal(works[0].chapters[0].number, 7)
  assert.equal(works[0].chapters[0].title, 'Part-two, the  return')
  assert.equal(works[0].chapters[0].scenes[0].position, 12)
  assert.equal(works[0].chapters[0].scenes[0].title, 'a-b-c')
})

test('skips what does not fit the layout, with a reason, and ignores hidden entries', () => {
  const root = makeLibrary({
    'loose.md': '',
    '.ficbible-test-library': '',
    'W/notes.txt': '',
    'W/chapter one/': null,
    'W/00-Prologue/': null,
    'W/01-/': null,
    'W/01-Real/01-ok.md': '',
    'W/01-Real/02-notes.txt': '',
    'W/01-Real/draft.md': '',
    'W/01-Real/03-SHOUT.MD': '',
    'W/01-Real/04-.md': '',
    'W/01-Real/old/': null,
    'W/01-Real/.swp': ''
  })
  const { works, skipped } = scanLibrary(root)

  assert.match(reasonFor(skipped, 'loose.md'), /top of the library/)
  assert.match(reasonFor(skipped, 'W', 'notes.txt'), /not in a chapter folder/)
  assert.match(reasonFor(skipped, 'W', 'chapter one'), /##-title/)
  assert.match(reasonFor(skipped, 'W', '00-Prologue'), /1 or more/)
  assert.match(reasonFor(skipped, 'W', '01-'), /##-title/)
  assert.match(reasonFor(skipped, 'W', '01-Real', '02-notes.txt'), /not a \.md file/)
  assert.match(reasonFor(skipped, 'W', '01-Real', 'draft.md'), /##-title/)
  assert.match(reasonFor(skipped, 'W', '01-Real', '03-SHOUT.MD'), /not a \.md file/)
  assert.match(reasonFor(skipped, 'W', '01-Real', '04-.md'), /##-title/)
  assert.match(reasonFor(skipped, 'W', '01-Real', 'old'), /folder inside a chapter/)
  assert.equal(skipped.length, 10, JSON.stringify(skipped))

  assert.deepEqual(
    works[0].chapters.map((c) => c.folder),
    ['01-Real']
  )
  assert.deepEqual(
    works[0].chapters[0].scenes.map((s) => s.filename),
    ['01-ok.md']
  )
})

test('two new items with the same number are both skipped', () => {
  const root = makeLibrary({
    'W/01-A/01-x.md': '',
    'W/01-A/01-y.md': '',
    'W/01-B/': null
  })
  const db = freshDb()
  const { added, skipped } = importLibrary(db, root)
  assert.deepEqual(added, { works: 1, chapters: 0, scenes: 0 })
  assert.match(reasonFor(skipped, 'W', '01-A'), /also uses number 1/)
  assert.match(reasonFor(skipped, 'W', '01-B'), /also uses number 1/)
})

test('re-import adds only what is new and leaves existing rows alone', () => {
  const root = makeLibrary({ 'W/01-One/01-first.md': '' })
  const db = freshDb()
  importLibrary(db, root)

  // Edits made in the app, which a re-import must not undo.
  db.prepare(`UPDATE scenes SET title = 'Renamed', pov = 'Mara', status = 'drafted'`).run()
  db.prepare(`UPDATE chapters SET title = 'Edited chapter'`).run()

  fs.writeFileSync(path.join(root, 'W', '01-One', '02-second.md'), '')
  fs.mkdirSync(path.join(root, 'W', '02-Two'))

  const again = importLibrary(db, root)
  assert.deepEqual(again.added, { works: 0, chapters: 1, scenes: 1 })
  assert.deepEqual(again.skipped, [])
  assert.deepEqual(db.prepare('SELECT title, pov, status FROM scenes ORDER BY position').all(), [
    { title: 'Renamed', pov: 'Mara', status: 'drafted' },
    { title: 'second', pov: '', status: 'outlined' }
  ])
  assert.equal(db.prepare('SELECT title FROM chapters WHERE number = 1').pluck().get(), 'Edited chapter')

  const third = importLibrary(db, root)
  assert.deepEqual(third.added, { works: 0, chapters: 0, scenes: 0 })
})

test('a new file whose number is taken by an existing row is skipped', () => {
  const root = makeLibrary({ 'W/01-One/01-first.md': '', 'W/01-One/': null })
  const db = freshDb()
  importLibrary(db, root)

  fs.writeFileSync(path.join(root, 'W', '01-One', '01-rival.md'), '')
  fs.mkdirSync(path.join(root, 'W', '01-Other'))
  const { added, skipped } = importLibrary(db, root)
  assert.deepEqual(added, { works: 0, chapters: 0, scenes: 0 })
  // The existing file is also on disk, so the scan sees two scenes numbered
  // 1; the new one is the one reported.
  assert.match(reasonFor(skipped, 'W', '01-One', '01-rival.md'), /number 1/)
  assert.match(reasonFor(skipped, 'W', '01-Other'), /number 1/)
  assert.equal(skipped.length, 2)
})

test('a scene file differing only in case from an existing one is skipped', () => {
  const db = freshDb()
  const root = makeLibrary({ 'W/01-One/': null })
  importLibrary(db, root)
  const chapterId = db.prepare('SELECT id FROM chapters').pluck().get()
  // Stand-in for a file that existed under the other case (only possible
  // on a case-sensitive filesystem).
  db.prepare(`INSERT INTO scenes (chapter_id, position, title, filename, pov) VALUES (?, 5, 'x', '02-Scene.md', '')`).run(
    chapterId
  )
  fs.writeFileSync(path.join(root, 'W', '01-One', '02-scene.md'), '')
  const { added, skipped } = importLibrary(db, root)
  assert.equal(added.scenes, 0)
  assert.match(reasonFor(skipped, 'W', '01-One', '02-scene.md'), /differs only in case/)
})

test('symbolic links are skipped, not followed', (t) => {
  const target = makeLibrary({ '01-x.md': '' })
  const root = makeLibrary({ 'W/': null })
  try {
    fs.symlinkSync(target, path.join(root, 'W', '01-Linked'), 'dir')
  } catch (e) {
    t.skip(`can't create a symlink here (${e.code})`)
    return
  }
  const { works, skipped } = scanLibrary(root)
  assert.equal(works[0].chapters.length, 0)
  assert.match(reasonFor(skipped, 'W', '01-Linked'), /symbolic link/)
})

test('importing writes nothing to disk', () => {
  const root = makeLibrary({
    'W/01-One/01-a.md': 'Some prose.\r\n\r\nMore.',
    'W/01-One/bad name.md': 'keep me',
    'W/02-Two/': null
  })
  const before = snapshot(root)
  importLibrary(freshDb(), root)
  assert.deepEqual(snapshot(root), before)
})

test('a failure part-way adds nothing', () => {
  const root = makeLibrary({ 'A/01-One/01-a.md': '', 'B/01-One/01-b.md': '' })
  const db = freshDb()
  // Make the second work's insert fail.
  db.exec(`CREATE TRIGGER no_b BEFORE INSERT ON works WHEN NEW.folder = 'B' BEGIN SELECT RAISE(ABORT, 'boom'); END`)
  assert.throws(() => importLibrary(db, root), /boom/)
  assert.equal(db.prepare('SELECT count(*) FROM works').pluck().get(), 0)
  assert.equal(db.prepare('SELECT count(*) FROM scenes').pluck().get(), 0)
})

test('worksMissingFrom lists works with no folder in the new library; deleteWorks cascades', () => {
  const oldRoot = makeLibrary({ 'Kept/01-One/01-a.md': '', 'Gone/01-One/01-b.md': '' })
  const newRoot = makeLibrary({ 'Kept/': null, 'Gone.md': '' })
  const db = freshDb()
  importLibrary(db, oldRoot)
  const sceneId = db.prepare(`SELECT id FROM scenes WHERE filename = '01-b.md'`).pluck().get()
  db.prepare(`INSERT INTO beats (scene_id, position, kind, content) VALUES (?, 1, 'plot', 'x')`).run(sceneId)

  const missing = worksMissingFrom(db, newRoot)
  assert.deepEqual(
    missing.map((w) => w.folder),
    ['Gone']
  )

  const before = snapshot(oldRoot)
  assert.equal(deleteWorks(db, missing.map((w) => w.id)), 1)
  assert.deepEqual(db.prepare('SELECT folder FROM works').pluck().all(), ['Kept'])
  assert.equal(db.prepare('SELECT count(*) FROM beats').pluck().get(), 0)
  assert.equal(db.prepare('SELECT count(*) FROM scenes').pluck().get(), 1)
  assert.deepEqual(snapshot(oldRoot), before)
})
