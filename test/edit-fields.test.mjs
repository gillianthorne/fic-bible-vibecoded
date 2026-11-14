// Scene, chapter and work field edits. Needs the Electron-built SQLite
// module: run through `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { openSqlite } from '../src/main/sqlite.js'
import { migrate } from '../src/main/migrate.js'
import { createHandlers } from '../src/main/handlers.js'
import { updateChapter, updateScene, updateWork } from '../src/main/edit.js'

const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url))

function setup() {
  const db = openSqlite(':memory:')
  migrate(db, MIGRATIONS)
  db.exec(`
    INSERT INTO works (id, title, folder) VALUES (1, 'W', 'W-folder'), (2, 'Other', 'Other');
    INSERT INTO chapters (id, work_id, number, title, folder) VALUES
      (1, 1, 1, 'One', '01-One'), (2, 1, 2, 'Two', '02-Two'), (3, 2, 1, 'Elsewhere', '01-Elsewhere');
    INSERT INTO scenes (id, chapter_id, position, title, filename, pov) VALUES
      (1, 1, 1, 'S1', '01-s1.md', ''), (2, 1, 2, 'S2', '02-s2.md', 'Mara'), (3, 2, 1, 'T1', '01-t1.md', '');
  `)
  return db
}

const row = (db, table, id) => db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id)

test('updateScene edits title, POV, status and position; never filename', () => {
  const db = setup()
  updateScene(db, 1, { title: '  New title ', pov: ' Mara ', status: 'drafted', position: 5 })
  assert.deepEqual(row(db, 'scenes', 1), {
    id: 1, chapter_id: 1, position: 5, title: 'New title', filename: '01-s1.md', pov: 'Mara', status: 'drafted', notes: null
  })
  updateScene(db, 1, { pov: '' })
  assert.equal(row(db, 'scenes', 1).pov, '')
  assert.throws(() => updateScene(db, 1, { filename: 'x.md' }), /no editable field “filename”/)
  assert.throws(() => updateScene(db, 1, { title: ' ' }), /Title can’t be blank/)
  assert.throws(() => updateScene(db, 1, { status: 'posted' }), /Status must be one of/)
})

test('a scene position used by a sibling is refused; other chapters do not count', () => {
  const db = setup()
  assert.throws(() => updateScene(db, 1, { position: 2, title: 'Changed' }), /Position 2 is already used by the scene “S2”/)
  assert.equal(row(db, 'scenes', 1).title, 'S1', 'nothing in the patch was applied')
  updateScene(db, 3, { position: 2 })
  updateScene(db, 1, { position: 1 })
  assert.equal(row(db, 'scenes', 3).position, 2)
})

test('updateChapter edits number, title, status, posted date and link; never folder', () => {
  const db = setup()
  updateChapter(db, 1, { number: 7, title: 'Renamed', status: 'posted', postedDate: '2026-02-28', postedUrl: ' https://archiveofourown.org/works/1 ' })
  const ch = row(db, 'chapters', 1)
  assert.deepEqual(
    [ch.number, ch.title, ch.status, ch.posted_date, ch.posted_url, ch.folder],
    [7, 'Renamed', 'posted', '2026-02-28', 'https://archiveofourown.org/works/1', '01-One']
  )
  updateChapter(db, 1, { postedDate: null, postedUrl: '  ' })
  assert.equal(row(db, 'chapters', 1).posted_date, null)
  assert.equal(row(db, 'chapters', 1).posted_url, null)
  assert.throws(() => updateChapter(db, 1, { folder: 'x' }), /no editable field “folder”/)
  assert.throws(() => updateChapter(db, 1, { postedDate: '2026-02-30' }), /not a real date/)
  assert.throws(() => updateChapter(db, 1, { postedDate: '28/02/2026' }), /YYYY-MM-DD/)
  assert.throws(() => updateChapter(db, 1, { number: 0 }), /whole number/)
})

test('a chapter number used in the same work is refused', () => {
  const db = setup()
  assert.throws(() => updateChapter(db, 1, { number: 2 }), /Chapter 2 already exists in this work: “Two”/)
  updateChapter(db, 3, { number: 2 })
  assert.equal(row(db, 'chapters', 3).number, 2)
})

test('updateWork edits the title only', () => {
  const db = setup()
  updateWork(db, 1, { title: 'Renamed work' })
  assert.deepEqual(row(db, 'works', 1), { id: 1, title: 'Renamed work', folder: 'W-folder', url: null, notes: null })
  assert.throws(() => updateWork(db, 1, { folder: 'x' }), /no editable field/)
  assert.throws(() => updateWork(db, 9, { title: 'x' }), /Work 9 not found/)
})

test('handlers: field updates and suggestions without blank POVs', () => {
  const db = setup()
  const handlers = createHandlers(() => ({ db, libraryRoot: '/x' }))
  assert.deepEqual(handlers['scene:update'](3, { pov: 'Mara' }), { ok: true, data: null })
  assert.deepEqual(handlers['chapter:update'](1, { status: 'ready to post' }), { ok: true, data: null })
  assert.deepEqual(handlers['work:update'](1, { title: 'X' }), { ok: true, data: null })
  assert.match(handlers['scene:update'](1, { position: 2 }).error, /already used/)
  assert.deepEqual(handlers.suggestions().data.povs, [{ value: 'Mara', count: 2 }])
})
