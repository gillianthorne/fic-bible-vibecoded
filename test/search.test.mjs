// Searching every work's characters. Needs the Electron-built SQLite
// module: run through `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openSqlite } from '../src/main/sqlite.js'
import { migrate } from '../src/main/migrate.js'
import { createCharacter, createWork } from '../src/main/create.js'
import { createCharacterField, updateCharacter } from '../src/main/edit.js'
import { searchCharacters } from '../src/main/search.js'

const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url))

function setup() {
  const db = openSqlite(':memory:')
  migrate(db, MIGRATIONS)
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fic-bible-search-')))
  const hockey = createWork(db, root, 'Hockey AU')
  const other = createWork(db, root, 'Another Fic')
  const marie = createCharacter(db, root, hockey, 'Marie')
  const laura = createCharacter(db, root, hockey, 'Laura Stacey')
  const ana = createCharacter(db, root, other, 'Ana')
  createCharacterField(db, marie, { label: 'Tims order', value: 'Medium double-double' })
  createCharacterField(db, marie, { label: 'Bagel order', value: 'Everything, plain cream cheese' })
  createCharacterField(db, laura, { label: 'Team', value: 'Montréal' })
  updateCharacter(db, ana, { birthday: '3 December' })
  const notes = (work, name) => path.join(root, work, 'characters', `${name}.md`)
  fs.writeFileSync(notes('Hockey AU', 'Laura Stacey'), 'Always orders for Marie.\r\nRemembers her BAGEL order, toasted.\r\n')
  fs.writeFileSync(notes('Another Fic', 'Ana'), 'Born in december, hates the cold.')
  return { db, root, notes }
}

const names = (result) => result.works.map((w) => [w.title, w.characters.map((c) => c.name)])

test('finds a value in any field, ignoring case, across every work', () => {
  const { db, root } = setup()
  const result = searchCharacters(db, root, '  bagel ')
  assert.equal(result.query, 'bagel')
  assert.deepEqual(names(result), [['Hockey AU', ['Laura Stacey', 'Marie']]])
  const [laura, marie] = result.works[0].characters
  assert.deepEqual(marie.matches, [{ where: 'field', label: 'Bagel order', value: 'Everything, plain cream cheese' }])
  assert.deepEqual(laura.matches, [{ where: 'notes', label: 'Notes', value: 'Remembers her BAGEL order, toasted.' }])
})

test('matches names, birthdays, labels and notes, grouped by work in sidebar order', () => {
  const { db, root } = setup()
  assert.deepEqual(names(searchCharacters(db, root, 'december')), [['Another Fic', ['Ana']]])
  assert.deepEqual(
    searchCharacters(db, root, 'december').works[0].characters[0].matches.map((m) => m.where),
    ['birthday', 'notes']
  )
  assert.deepEqual(names(searchCharacters(db, root, 'marie')), [['Hockey AU', ['Laura Stacey', 'Marie']]])
  assert.deepEqual(names(searchCharacters(db, root, 'TIMS')), [['Hockey AU', ['Marie']]])
  assert.deepEqual(names(searchCharacters(db, root, 'nothing like this')), [])
  assert.deepEqual(searchCharacters(db, root, '   ').works, [])
})

test('a long notes line is cut around the match; an unreadable notes file is reported', () => {
  const { db, root, notes } = setup()
  fs.writeFileSync(notes('Hockey AU', 'Marie'), `${'a'.repeat(300)} needle ${'b'.repeat(300)}`)
  const match = searchCharacters(db, root, 'needle').works[0].characters[0].matches[0]
  assert.match(match.value, /^….*needle.*…$/)
  assert.ok(match.value.length <= 142)
  fs.rmSync(notes('Another Fic', 'Ana'))
  const result = searchCharacters(db, root, 'december')
  assert.deepEqual(result.unreadable.map((u) => [u.name, u.error]), [['Ana', 'ENOENT']])
  assert.deepEqual(names(result), [['Another Fic', ['Ana']]])
})

test('search reads and writes nothing it shouldn’t', () => {
  const { db, root, notes } = setup()
  const before = fs.readFileSync(notes('Hockey AU', 'Laura Stacey'))
  searchCharacters(db, root, 'bagel')
  assert.deepEqual(fs.readFileSync(notes('Hockey AU', 'Laura Stacey')), before)
  assert.throws(() => searchCharacters(db, root, 5), /must be text/)
})
