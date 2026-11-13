import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MARKER, requireTestLibrary } from '../scripts/seed/guard.mjs'

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fic-bible-guard-'))
}

function snapshot(dir) {
  return fs.readdirSync(dir, { recursive: true }).sort()
}

test('refuses a library with no marker, and writes nothing', () => {
  const root = tempDir()
  fs.writeFileSync(path.join(root, 'real-scene.md'), 'Real prose.')
  const before = snapshot(root)
  assert.throws(() => requireTestLibrary(root), /Refusing to seed.*no \.ficbible-test-library.*Nothing was written/s)
  assert.deepEqual(snapshot(root), before)
})

test('refuses when the marker name is a folder, not a file', () => {
  const root = tempDir()
  fs.mkdirSync(path.join(root, MARKER))
  const before = snapshot(root)
  assert.throws(() => requireTestLibrary(root), /not a regular file/)
  assert.deepEqual(snapshot(root), before)
})

test('refuses a root that does not exist, and does not create it', () => {
  const root = path.join(tempDir(), 'missing')
  assert.throws(() => requireTestLibrary(root), /does not exist/)
  assert.equal(fs.existsSync(root), false)
})

test('refuses when no root is given', () => {
  assert.throws(() => requireTestLibrary(undefined), /No library root given/)
})

test('accepts a marked library and returns its real path', () => {
  const root = tempDir()
  fs.writeFileSync(path.join(root, MARKER), '')
  assert.equal(requireTestLibrary(root), fs.realpathSync(root))
})
