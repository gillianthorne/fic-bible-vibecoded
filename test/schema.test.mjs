// Checks the real migrations/ against the rules in docs/spec.md.
// Run through `npm test` (Electron's Node), like migrate.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openSqlite } from '../src/main/sqlite.js'
import { migrate } from '../src/main/migrate.js'

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

function freshDb() {
  const db = openSqlite(':memory:')
  migrate(db, migrationsDir)
  return db
}

function seed(db) {
  db.prepare("INSERT INTO works (id, title, folder) VALUES (1, 'W', 'w')").run()
  db.prepare(
    "INSERT INTO chapters (id, work_id, number, title, folder) VALUES (1, 1, 1, 'C', 'c')"
  ).run()
  db.prepare(
    "INSERT INTO scenes (id, chapter_id, position, title, filename, pov) VALUES (1, 1, 1, 'S', 's.md', 'A')"
  ).run()
  db.prepare(
    "INSERT INTO beats (scene_id, position, kind, content) VALUES (1, 1, 'plot', 'x')"
  ).run()
}

test('creates exactly the spec tables, with no wordcount column', () => {
  const db = freshDb()
  const tables = db
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")
    .pluck()
    .all()
  assert.deepEqual(tables, [
    'beats', 'chapters', 'character_fields', 'characters', 'edit_notes', 'fandoms', 'lines', 'note_pages', 'scenes',
    'ships', 'timeline_events', 'works'
  ])
  for (const t of tables) {
    const cols = db.prepare(`SELECT name FROM pragma_table_info(?)`).pluck().all(t)
    assert.ok(!cols.some((c) => /word/i.test(c)), `${t} has a wordcount-like column`)
  }
})

test('status defaults and CHECK constraints use the spec vocabulary', () => {
  const db = freshDb()
  seed(db)
  assert.equal(db.prepare('SELECT status FROM chapters').pluck().get(), 'drafting')
  assert.equal(db.prepare('SELECT status FROM scenes').pluck().get(), 'outlined')
  assert.equal(db.prepare('SELECT status FROM beats').pluck().get(), 'planned')
  db.prepare("UPDATE chapters SET status = 'ready to post'").run()
  db.prepare("UPDATE scenes SET status = 'revised'").run()
  db.prepare("UPDATE beats SET status = 'in draft'").run()
  assert.throws(() => db.prepare("UPDATE chapters SET status = 'done'").run(), /CHECK/)
  assert.throws(() => db.prepare("UPDATE scenes SET status = 'Drafted'").run(), /CHECK/)
  assert.throws(() => db.prepare("UPDATE beats SET status = 'landed'").run(), /CHECK/)
  db.prepare("INSERT INTO edit_notes (scene_id, paragraph, note) VALUES (1, 1, 'x')").run()
  assert.equal(db.prepare('SELECT status FROM edit_notes').pluck().get(), 'open')
  for (const ok of ['fixed', 'ignored', 'cut']) db.prepare('UPDATE edit_notes SET status = ?').run(ok)
  assert.throws(() => db.prepare("UPDATE edit_notes SET status = 'done'").run(), /CHECK/)
})

test('foreign keys reject orphans', () => {
  const db = freshDb()
  assert.throws(
    () =>
      db
        .prepare("INSERT INTO chapters (work_id, number, title, folder) VALUES (99, 1, 'C', 'c')")
        .run(),
    /FOREIGN KEY/
  )
})

test('deleting a work cascades to chapters, scenes and beats', () => {
  const db = freshDb()
  seed(db)
  db.prepare('DELETE FROM works WHERE id = 1').run()
  for (const t of ['chapters', 'scenes', 'beats']) {
    assert.equal(db.prepare(`SELECT count(*) FROM ${t}`).pluck().get(), 0, t)
  }
})

test('folder and filename must be a single path segment', () => {
  const db = freshDb()
  seed(db)
  for (const bad of ['', '.', '..', 'a/b', 'a\\b']) {
    assert.throws(
      () => db.prepare('UPDATE scenes SET filename = ?').run(bad),
      /CHECK/,
      JSON.stringify(bad)
    )
    assert.throws(() => db.prepare('UPDATE works SET folder = ?').run(bad), /CHECK/)
  }
})

test('scene filenames are unique within a chapter regardless of case', () => {
  const db = freshDb()
  seed(db)
  assert.throws(
    () =>
      db
        .prepare(
          "INSERT INTO scenes (chapter_id, position, title, filename, pov) VALUES (1, 2, 'T', 'S.md', 'A')"
        )
        .run(),
    /UNIQUE/
  )
})

test('only the spec-nullable columns accept NULL', () => {
  const db = freshDb()
  const nullable = db
    .prepare(
      `SELECT m.name || '.' || p.name FROM sqlite_schema m, pragma_table_info(m.name) p
       WHERE m.type = 'table' AND p."notnull" = 0 AND p.pk = 0 ORDER BY 1`
    )
    .pluck()
    .all()
  assert.deepEqual(nullable, [
    'beats.paragraph_ref',
    'chapters.notes',
    'chapters.posted_date',
    'chapters.posted_url',
    'lines.beat_id',
    'lines.chapter_id',
    'lines.notes',
    'lines.scene_id',
    'scenes.notes',
    'timeline_events.chapter_id',
    'timeline_events.notes',
    'works.fandom_id',
    'works.notes',
    'works.ship_id',
    'works.url'
  ])
})

test('fandom and ship names are unique case-insensitively, and never blank', () => {
  const db = freshDb()
  db.exec("INSERT INTO fandoms (id, name) VALUES (1, 'Good Omens'), (2, 'Other')")
  assert.throws(() => db.exec("INSERT INTO fandoms (name) VALUES ('good omens')"), /UNIQUE/)
  assert.throws(() => db.exec("INSERT INTO fandoms (name) VALUES ('  ')"), /CHECK/)
  db.exec("INSERT INTO ships (fandom_id, name) VALUES (1, 'Aziraphale/Crowley')")
  assert.throws(() => db.exec("INSERT INTO ships (fandom_id, name) VALUES (1, 'aziraphale/crowley')"), /UNIQUE/)
  // The same ship name can exist in two fandoms.
  db.exec("INSERT INTO ships (fandom_id, name) VALUES (2, 'Aziraphale/Crowley')")
})

test('deleting a fandom leaves its works with no fandom and no ship', () => {
  const db = freshDb()
  seed(db)
  db.exec("INSERT INTO fandoms (id, name) VALUES (1, 'F'); INSERT INTO ships (id, fandom_id, name) VALUES (1, 1, 'S')")
  db.exec('UPDATE works SET fandom_id = 1, ship_id = 1')
  db.exec('DELETE FROM fandoms')
  assert.deepEqual(db.prepare('SELECT fandom_id, ship_id FROM works').get(), { fandom_id: null, ship_id: null })
  assert.equal(db.prepare('SELECT count(*) FROM ships').pluck().get(), 0)
})

test('notes and the work link start out null', () => {
  const db = freshDb()
  seed(db)
  assert.equal(db.prepare('SELECT url FROM works').pluck().get(), null)
  for (const t of ['works', 'chapters', 'scenes']) {
    assert.equal(db.prepare(`SELECT notes FROM ${t}`).pluck().get(), null, t)
  }
})

test('characters: filename is one segment, unique in its work ignoring case; fields need a label', () => {
  const db = freshDb()
  seed(db)
  db.exec("INSERT INTO characters (id, work_id, name, filename) VALUES (1, 1, 'Marie', 'Marie.md')")
  assert.deepEqual(db.prepare('SELECT age, birthday FROM characters').get(), { age: '', birthday: '' })
  assert.throws(() => db.exec("INSERT INTO characters (work_id, name, filename) VALUES (1, 'M', 'marie.md')"), /UNIQUE/)
  for (const bad of ['', '.', '..', 'a/b', 'a\\b']) {
    assert.throws(() => db.prepare('UPDATE characters SET filename = ?').run(bad), /CHECK/, JSON.stringify(bad))
  }
  assert.throws(() => db.exec("INSERT INTO characters (work_id, name, filename) VALUES (1, '  ', 'x.md')"), /CHECK/)
  db.exec("INSERT INTO character_fields (character_id, position, label, value) VALUES (1, 1, 'Team', 'Toronto')")
  assert.throws(() => db.exec("INSERT INTO character_fields (character_id, position, label) VALUES (1, 2, ' ')"), /CHECK/)
  assert.throws(() => db.exec("INSERT INTO character_fields (character_id, position, label) VALUES (1, 1, 'Dup')"), /UNIQUE/)
  db.exec('DELETE FROM works')
  assert.equal(db.prepare('SELECT count(*) FROM characters').pluck().get(), 0)
  assert.equal(db.prepare('SELECT count(*) FROM character_fields').pluck().get(), 0)
})

test('lines: statuses, a scene needs a chapter, deleting a chapter or scene clears links but keeps the line', () => {
  const db = freshDb()
  seed(db)
  db.exec("INSERT INTO lines (id, work_id, line, chapter_id, scene_id, beat_id) VALUES (1, 1, 'Hi', 1, 1, 1)")
  assert.equal(db.prepare('SELECT status FROM lines').pluck().get(), 'planned')
  for (const ok of ['used', 'dropped']) db.prepare('UPDATE lines SET status = ?').run(ok)
  assert.throws(() => db.exec("UPDATE lines SET status = 'cut'"), /CHECK/)
  assert.throws(() => db.exec('UPDATE lines SET chapter_id = NULL'), /CHECK/)
  assert.throws(() => db.exec('UPDATE lines SET scene_id = NULL'), /CHECK/)
  assert.throws(() => db.exec("INSERT INTO lines (work_id, line) VALUES (1, '  ')"), /CHECK/)
  db.exec('DELETE FROM beats')
  assert.deepEqual(db.prepare('SELECT chapter_id, scene_id, beat_id FROM lines').get(), { chapter_id: 1, scene_id: 1, beat_id: null })
  db.exec('UPDATE lines SET beat_id = NULL')
  db.exec('DELETE FROM scenes')
  assert.deepEqual(db.prepare('SELECT chapter_id, scene_id FROM lines').get(), { chapter_id: 1, scene_id: null })
  db.exec("INSERT INTO scenes (id, chapter_id, position, title, filename, pov) VALUES (2, 1, 1, 'S', 's.md', '')")
  db.exec('UPDATE lines SET scene_id = 2')
  db.exec('DELETE FROM chapters')
  assert.deepEqual(db.prepare('SELECT chapter_id, scene_id, beat_id FROM lines').get(), { chapter_id: null, scene_id: null, beat_id: null })
  db.exec('DELETE FROM works')
  assert.equal(db.prepare('SELECT count(*) FROM lines').pluck().get(), 0)
})

test('timeline events and note pages: ordered per work; note page files unique ignoring case', () => {
  const db = freshDb()
  seed(db)
  db.exec("INSERT INTO timeline_events (work_id, position, event, chapter_id) VALUES (1, 1, 'Draft day', 1)")
  assert.throws(() => db.exec("INSERT INTO timeline_events (work_id, position, event) VALUES (1, 1, 'x')"), /UNIQUE/)
  db.exec('DELETE FROM chapters')
  assert.equal(db.prepare('SELECT chapter_id FROM timeline_events').pluck().get(), null)
  db.exec("INSERT INTO note_pages (work_id, position, name, filename) VALUES (1, 1, 'Logline', 'Logline.md')")
  assert.throws(() => db.exec("INSERT INTO note_pages (work_id, position, name, filename) VALUES (1, 2, 'x', 'logline.md')"), /UNIQUE/)
  assert.throws(() => db.exec("INSERT INTO note_pages (work_id, position, name, filename) VALUES (1, 3, 'x', 'a/b')"), /CHECK/)
  db.exec('DELETE FROM works')
  assert.equal(db.prepare('SELECT count(*) FROM note_pages').pluck().get(), 0)
})
