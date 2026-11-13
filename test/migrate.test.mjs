// Needs the Electron-built SQLite module, so run through `npm test`,
// which uses scripts/run-as-node.mjs rather than system Node.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openSqlite } from '../src/main/sqlite.js'
import { listMigrations, migrate } from '../src/main/migrate.js'

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fic-bible-migrate-'))
}

function writeMigrations(files) {
  const dir = tempDir()
  for (const [name, sql] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), sql)
  }
  return dir
}

test('applies pending migrations in order and sets user_version', () => {
  const dir = writeMigrations({
    '0001_a.sql': 'CREATE TABLE a (id INTEGER PRIMARY KEY);',
    '0002_b.sql': 'CREATE TABLE b (id INTEGER PRIMARY KEY);'
  })
  const db = openSqlite(':memory:')
  assert.deepEqual(migrate(db, dir), { from: 0, to: 2, applied: ['0001_a.sql', '0002_b.sql'] })
})

test('a second run applies nothing', () => {
  const dir = writeMigrations({ '0001_a.sql': 'CREATE TABLE a (id INTEGER PRIMARY KEY);' })
  const db = openSqlite(':memory:')
  migrate(db, dir)
  assert.deepEqual(migrate(db, dir), { from: 1, to: 1, applied: [] })
})

test('only migrations newer than user_version run', () => {
  const dir = writeMigrations({ '0001_a.sql': 'CREATE TABLE a (id INTEGER PRIMARY KEY);' })
  const db = openSqlite(':memory:')
  migrate(db, dir)
  fs.writeFileSync(path.join(dir, '0002_b.sql'), 'CREATE TABLE b (id INTEGER PRIMARY KEY);')
  assert.deepEqual(migrate(db, dir).applied, ['0002_b.sql'])
})

test('a failing migration rolls back entirely and stops', () => {
  const dir = writeMigrations({
    '0001_a.sql': 'CREATE TABLE a (id INTEGER PRIMARY KEY);',
    // First statement succeeds, second fails: the first must not persist.
    '0002_bad.sql': 'CREATE TABLE b (id INTEGER PRIMARY KEY); INSERT INTO nowhere VALUES (1);',
    '0003_c.sql': 'CREATE TABLE c (id INTEGER PRIMARY KEY);'
  })
  const db = openSqlite(':memory:')
  assert.throws(() => migrate(db, dir), /0002_bad\.sql failed and was rolled back/)
  assert.equal(db.pragma('user_version', { simple: true }), 1)
  const tables = db
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")
    .pluck()
    .all()
  assert.deepEqual(tables, ['a'])
})

test('refuses a database newer than the migrations', () => {
  const dir = writeMigrations({ '0001_a.sql': 'CREATE TABLE a (id INTEGER PRIMARY KEY);' })
  const db = openSqlite(':memory:')
  db.pragma('user_version = 5')
  assert.throws(() => migrate(db, dir), /schema version 5/)
})

test('rejects gaps, duplicates and badly named files', () => {
  assert.throws(() => listMigrations(writeMigrations({ '0002_a.sql': '' })), /expected 1/)
  assert.throws(
    () => listMigrations(writeMigrations({ '0001_a.sql': '', '0001_b.sql': '' })),
    /expected 2/
  )
  assert.throws(() => listMigrations(writeMigrations({ '1_a.sql': '' })), /NNNN_name\.sql/)
})

test('connections have foreign keys enforced', () => {
  const db = openSqlite(':memory:')
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1)
})
