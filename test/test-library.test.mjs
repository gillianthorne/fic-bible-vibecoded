// The app's dev-only test-library check and read-only open.
// Uses the Electron-built SQLite module: run through `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { checkTestLibrary, MARKER, TEST_DB_NAME } from '../src/main/test-library.js'
import { openSqlite } from '../src/main/sqlite.js'

const tempDir = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fic-bible-testlib-')))

test('refuses a folder with no marker', () => {
  assert.throws(() => checkTestLibrary(tempDir()), /is not a test library: it has no/)
})

test('refuses a marker that is a folder', () => {
  const root = tempDir()
  fs.mkdirSync(path.join(root, MARKER))
  assert.throws(() => checkTestLibrary(root), /is not a regular file/)
})

test('refuses a folder that does not exist', () => {
  assert.throws(() => checkTestLibrary(path.join(tempDir(), 'nope')), /does not exist/)
})

test('accepts a marked library', () => {
  const root = tempDir()
  fs.writeFileSync(path.join(root, MARKER), '')
  assert.equal(checkTestLibrary(root), root)
})

test('read-only open refuses writes and will not create a missing database', () => {
  const root = tempDir()
  const file = path.join(root, TEST_DB_NAME)
  const rw = openSqlite(file)
  rw.exec('CREATE TABLE t (x)')
  rw.close()

  const ro = openSqlite(file, { readonly: true })
  try {
    assert.throws(() => ro.exec('INSERT INTO t VALUES (1)'), /readonly/)
  } finally {
    ro.close()
  }
  assert.throws(() => openSqlite(path.join(root, 'missing.sqlite'), { readonly: true }))
  assert.equal(fs.existsSync(path.join(root, 'missing.sqlite')), false)
})
