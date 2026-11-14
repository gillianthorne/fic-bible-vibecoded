import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { writeLibraryRoot } from '../src/main/config-file.js'

function tempConfig() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fic-bible-config-'))
  return path.join(dir, 'config.json')
}

const library = path.join(os.tmpdir(), 'some library')

test('creates config.json when there is none', () => {
  const file = tempConfig()
  writeLibraryRoot(file, library)
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { libraryRoot: path.normalize(library) })
})

test('replaces libraryRoot and keeps other keys', () => {
  const file = tempConfig()
  fs.writeFileSync(file, JSON.stringify({ libraryRoot: path.join(os.tmpdir(), 'old'), other: 42 }))
  writeLibraryRoot(file, library)
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { libraryRoot: path.normalize(library), other: 42 })
})

test('leaves no temporary file behind', () => {
  const file = tempConfig()
  writeLibraryRoot(file, library)
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['config.json'])
})

test('refuses a relative path and writes nothing', () => {
  const file = tempConfig()
  assert.throws(() => writeLibraryRoot(file, 'relative/library'), /absolute path/)
  assert.equal(fs.existsSync(file), false)
})

test('leaves a broken config.json untouched', () => {
  const file = tempConfig()
  fs.writeFileSync(file, '{ not json')
  assert.throws(() => writeLibraryRoot(file, library), /not valid JSON/)
  assert.equal(fs.readFileSync(file, 'utf8'), '{ not json')

  fs.writeFileSync(file, '[1, 2]')
  assert.throws(() => writeLibraryRoot(file, library), /JSON object/)
  assert.equal(fs.readFileSync(file, 'utf8'), '[1, 2]')
})
