// Character profiles: rows, fields, and what the sidebar and profile read.
// Needs the Electron-built SQLite module: run through `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openSqlite } from '../src/main/sqlite.js'
import { migrate } from '../src/main/migrate.js'
import { createCharacter, createWork } from '../src/main/create.js'
import { characterProfile, navigationTree, suggestions } from '../src/main/queries.js'
import {
  createCharacterField,
  deleteCharacter,
  deleteCharacterField,
  moveCharacterField,
  updateCharacter,
  updateCharacterField
} from '../src/main/edit.js'

const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url))

function setup() {
  const db = openSqlite(':memory:')
  migrate(db, MIGRATIONS)
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fic-bible-characters-')))
  const workId = createWork(db, root, 'Hockey AU')
  const characterId = createCharacter(db, root, workId, 'Marie')
  return { db, root, workId, characterId }
}

const labels = (db, id) => characterProfile(db, id).fields.map((f) => f.label)

test('the profile has the fixed fields, the work, and fields in order', () => {
  const { db, characterId, workId } = setup()
  updateCharacter(db, characterId, { age: ' 24 ', birthday: '28 March' })
  createCharacterField(db, characterId, { label: 'Team', value: 'Montréal' })
  createCharacterField(db, characterId, { label: 'Tims order', value: 'medium double-double\n' })
  createCharacterField(db, characterId, { label: 'Bagel order' })
  assert.deepEqual(characterProfile(db, characterId), {
    id: characterId,
    name: 'Marie',
    age: '24',
    birthday: '28 March',
    filename: 'Marie.md',
    work: { id: workId, title: 'Hockey AU' },
    fields: [
      { id: 1, position: 1, label: 'Team', value: 'Montréal' },
      { id: 2, position: 2, label: 'Tims order', value: 'medium double-double' },
      { id: 3, position: 3, label: 'Bagel order', value: '' }
    ]
  })
  assert.equal(characterProfile(db, 999), null)
})

test('fields move up and down, and deleting one closes the gap', () => {
  const { db, characterId } = setup()
  const [a, b, c] = ['A', 'B', 'C'].map((label) => createCharacterField(db, characterId, { label }))
  moveCharacterField(db, c, 'up')
  assert.deepEqual(labels(db, characterId), ['A', 'C', 'B'])
  moveCharacterField(db, a, 'up')
  assert.deepEqual(labels(db, characterId), ['A', 'C', 'B'])
  deleteCharacterField(db, a)
  assert.deepEqual(characterProfile(db, characterId).fields.map((f) => [f.label, f.position]), [['C', 1], ['B', 2]])
  updateCharacterField(db, b, { label: 'Position', value: 'Centre' })
  assert.deepEqual(characterProfile(db, characterId).fields.at(-1), { id: b, position: 2, label: 'Position', value: 'Centre' })
})

test('bad edits are refused', () => {
  const { db, characterId } = setup()
  assert.throws(() => updateCharacter(db, characterId, { name: '  ' }), /Name can’t be blank/)
  assert.throws(() => updateCharacter(db, characterId, { filename: 'x.md' }), /no editable field “filename”/)
  assert.throws(() => createCharacterField(db, characterId, { value: 'x' }), /needs a label/)
  assert.throws(() => createCharacterField(db, characterId, { label: '' }), /Label can’t be blank/)
  assert.throws(() => createCharacterField(db, 99, { label: 'x' }), /Character 99 not found/)
})

test('renaming keeps the filename; deleting removes rows but leaves the notes file', () => {
  const { db, root, characterId } = setup()
  createCharacterField(db, characterId, { label: 'Team' })
  updateCharacter(db, characterId, { name: 'Marie-Philip' })
  assert.equal(characterProfile(db, characterId).filename, 'Marie.md')
  const file = path.join(root, 'Hockey AU', 'characters', 'Marie.md')
  fs.writeFileSync(file, 'notes')
  deleteCharacter(db, characterId)
  assert.equal(db.prepare('SELECT count(*) FROM character_fields').pluck().get(), 0)
  assert.equal(fs.readFileSync(file, 'utf8'), 'notes')
})

test('the sidebar lists each work’s characters by name; labels are suggested across works', () => {
  const { db, root, workId, characterId } = setup()
  createCharacter(db, root, workId, 'anna')
  const other = createWork(db, root, 'Other')
  const z = createCharacter(db, root, other, 'Zed')
  createCharacterField(db, characterId, { label: 'Team' })
  createCharacterField(db, z, { label: 'Team' })
  createCharacterField(db, z, { label: 'Position' })
  const tree = navigationTree(db)
  assert.deepEqual(tree.map((w) => w.characters.map((c) => c.name)), [['anna', 'Marie'], ['Zed']])
  assert.deepEqual(suggestions(db).fieldLabels, [
    { value: 'Team', count: 2 },
    { value: 'Position', count: 1 }
  ])
})
