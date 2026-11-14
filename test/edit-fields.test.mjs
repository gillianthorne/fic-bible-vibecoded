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

test('updateWork edits the title, link and notes; never folder', () => {
  const db = setup()
  updateWork(db, 1, { title: 'Renamed work' })
  assert.deepEqual(row(db, 'works', 1), { id: 1, title: 'Renamed work', folder: 'W-folder', url: null, notes: null, fandom_id: null, ship_id: null })
  assert.throws(() => updateWork(db, 1, { folder: 'x' }), /no editable field/)
  assert.throws(() => updateWork(db, 9, { title: 'x' }), /Work 9 not found/)
  updateWork(db, 1, { url: ' https://archiveofourown.org/works/42 ', notes: 'Inspired by a song.\n\nSecond line.' })
  assert.equal(row(db, 'works', 1).url, 'https://archiveofourown.org/works/42')
  assert.equal(row(db, 'works', 1).notes, 'Inspired by a song.\n\nSecond line.')
  updateWork(db, 1, { url: '', notes: '  \n ' })
  assert.equal(row(db, 'works', 1).url, null)
  assert.equal(row(db, 'works', 1).notes, null)
  assert.throws(() => updateWork(db, 1, { notes: 5 }), /Notes must be text/)
})

const names = (db, id) =>
  db
    .prepare(
      `SELECT f.name AS fandom, s.name AS ship FROM works w
       LEFT JOIN fandoms f ON f.id = w.fandom_id LEFT JOIN ships s ON s.id = w.ship_id WHERE w.id = ?`
    )
    .get(id)

test('updateWork sets a fandom and ship by name, creating them once', () => {
  const db = setup()
  updateWork(db, 1, { fandom: ' Good Omens ', ship: 'Aziraphale/Crowley' })
  assert.deepEqual(names(db, 1), { fandom: 'Good Omens', ship: 'Aziraphale/Crowley' })
  // Another work typing the same names (in any case) reuses the rows.
  updateWork(db, 2, { fandom: 'good omens', ship: 'aziraphale/crowley' })
  assert.deepEqual(names(db, 2), { fandom: 'Good Omens', ship: 'Aziraphale/Crowley' })
  assert.equal(db.prepare('SELECT count(*) FROM fandoms').pluck().get(), 1)
  assert.equal(db.prepare('SELECT count(*) FROM ships').pluck().get(), 1)
})

test('a blank ship is gen; a ship needs a fandom', () => {
  const db = setup()
  updateWork(db, 1, { fandom: 'Good Omens', ship: '' })
  assert.deepEqual(names(db, 1), { fandom: 'Good Omens', ship: null })
  assert.throws(() => updateWork(db, 2, { fandom: null, ship: 'X/Y' }), /A ship needs a fandom/)
  assert.throws(() => updateWork(db, 2, { ship: 'X/Y' }), /A ship needs a fandom/)
  assert.deepEqual(names(db, 2), { fandom: null, ship: null })
})

test('changing or clearing the fandom clears a ship that is not given', () => {
  const db = setup()
  updateWork(db, 1, { fandom: 'Good Omens', ship: 'Aziraphale/Crowley' })
  updateWork(db, 1, { fandom: 'Other Fandom' })
  assert.deepEqual(names(db, 1), { fandom: 'Other Fandom', ship: null })
  updateWork(db, 1, { fandom: 'Good Omens', ship: 'Aziraphale/Crowley' })
  updateWork(db, 1, { title: 'Just the title' })
  assert.deepEqual(names(db, 1), { fandom: 'Good Omens', ship: 'Aziraphale/Crowley' })
  updateWork(db, 1, { fandom: '' })
  assert.deepEqual(names(db, 1), { fandom: null, ship: null })
})

test('fandoms and ships no work uses are removed', () => {
  const db = setup()
  updateWork(db, 1, { fandom: 'Typo Fandmo', ship: 'A/B' })
  updateWork(db, 1, { fandom: 'Typo Fandom', ship: 'A/B' })
  assert.deepEqual(db.prepare('SELECT name FROM fandoms').pluck().all(), ['Typo Fandom'])
  assert.equal(db.prepare('SELECT count(*) FROM ships').pluck().get(), 1)
})

test('updateWork with fandom and other fields saves them together, or not at all', () => {
  const db = setup()
  updateWork(db, 1, { title: 'New', url: '', fandom: 'F', ship: 'S' })
  assert.equal(row(db, 'works', 1).title, 'New')
  assert.throws(() => updateWork(db, 1, { title: '', fandom: 'G' }), /Title can’t be blank/)
  assert.deepEqual(names(db, 1), { fandom: 'F', ship: 'S' })
  assert.throws(() => updateWork(db, 1, { fandom: 5 }), /Fandom must be text/)
  assert.throws(() => updateWork(db, 1, null), /must be an object/)
  assert.throws(() => updateWork(db, 1, {}), /No Work changes given/)
})

test('chapter and scene notes keep line breaks; blank clears them', () => {
  const db = setup()
  const notes = '  Workskin CSS: html/ch2-skin.css\nHTML: html/ch2-s3.html\n'
  updateScene(db, 1, { notes })
  updateChapter(db, 1, { notes: 'Chapter note' })
  assert.equal(row(db, 'scenes', 1).notes, notes)
  assert.equal(row(db, 'chapters', 1).notes, 'Chapter note')
  updateScene(db, 1, { notes: '' })
  updateChapter(db, 1, { notes: null })
  assert.equal(row(db, 'scenes', 1).notes, null)
  assert.equal(row(db, 'chapters', 1).notes, null)
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
