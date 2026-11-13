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

test('creates exactly the four spec tables, with no wordcount column', () => {
  const db = freshDb()
  const tables = db
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")
    .pluck()
    .all()
  assert.deepEqual(tables, ['beats', 'chapters', 'scenes', 'works'])
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
  assert.deepEqual(nullable, ['beats.paragraph_ref', 'chapters.posted_date', 'chapters.posted_url'])
})
