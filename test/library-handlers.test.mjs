// The library:* handlers with a fake of the Electron side (dialogs and
// config). Needs the Electron-built SQLite module: run through `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openSqlite } from '../src/main/sqlite.js'
import { migrate } from '../src/main/migrate.js'
import { createHandlers } from '../src/main/handlers.js'
import { importLibrary } from '../src/main/import.js'

const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url))

function library(dirs) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fic-bible-lib-')))
  for (const d of dirs) fs.mkdirSync(path.join(root, ...d.split('/')), { recursive: true })
  return root
}

// A fake Electron side. `picks` is what the folder dialog returns, `answer`
// what the keep/clear prompt returns. Records what it was asked.
function setup({ current, pick, answer = 'keep' }) {
  const db = openSqlite(':memory:')
  migrate(db, MIGRATIONS)
  const state = { libraryRoot: current, saved: [], asked: [] }
  const fake = {
    current: () => ({ libraryRoot: state.libraryRoot, source: 'config.json' }),
    chooseFolder: async () => pick,
    confirmMissing: async (works, root) => {
      state.asked.push({ works: works.map((w) => w.title), root })
      return answer
    },
    save: (root) => {
      state.saved.push(root)
      state.libraryRoot = root
      return root
    }
  }
  const handlers = createHandlers(() => ({ db, libraryRoot: state.libraryRoot }), fake)
  return { db, state, handlers }
}

const workTitles = (db) => db.prepare('SELECT title FROM works ORDER BY title').pluck().all()

test('choosing a folder saves it and imports it', async () => {
  const root = library(['W/01-One'])
  const { db, state, handlers } = setup({ current: null, pick: root })
  const result = await handlers['library:choose']()
  assert.equal(result.ok, true, result.error)
  assert.deepEqual(state.saved, [root])
  assert.deepEqual(result.data.added, { works: 1, chapters: 1, scenes: 0 })
  assert.equal(result.data.cleared, 0)
  assert.deepEqual(state.asked, [])
  assert.deepEqual(workTitles(db), ['W'])
})

test('cancelling the folder dialog changes nothing', async () => {
  const { state, handlers } = setup({ current: '/old', pick: null })
  const result = await handlers['library:choose']()
  assert.deepEqual(result, { ok: true, data: null })
  assert.deepEqual(state.saved, [])
})

for (const [answer, expected] of [
  ['keep', ['Gone', 'Kept', 'New']],
  ['clear', ['Kept', 'New']],
  ['cancel', ['Gone', 'Kept']]
]) {
  test(`works missing from the new folder: ${answer}`, async () => {
    const oldRoot = library(['Kept', 'Gone'])
    const newRoot = library(['Kept', 'New'])
    const { db, state, handlers } = setup({ current: oldRoot, pick: newRoot, answer })
    importLibrary(db, oldRoot)

    const result = await handlers['library:choose']()
    assert.equal(result.ok, true, result.error)
    assert.deepEqual(state.asked, [{ works: ['Gone'], root: newRoot }])
    assert.deepEqual(workTitles(db), expected)
    if (answer === 'cancel') {
      assert.equal(result.data, null)
      assert.deepEqual(state.saved, [])
    } else {
      assert.deepEqual(state.saved, [newRoot])
      assert.equal(result.data.cleared, answer === 'clear' ? 1 : 0)
    }
  })
}

test('library:import re-imports the current library', () => {
  const root = library(['W/01-One'])
  const { handlers } = setup({ current: root, pick: null })
  const first = handlers['library:import']()
  assert.deepEqual(first.data.added, { works: 1, chapters: 1, scenes: 0 })
  fs.writeFileSync(path.join(root, 'W', '01-One', '01-new.md'), '')
  const second = handlers['library:import']()
  assert.deepEqual(second.data.added, { works: 0, chapters: 0, scenes: 1 })
  assert.equal(second.data.libraryRoot, root)
})

test('with no library side (test library), changing and importing are refused', async () => {
  const db = openSqlite(':memory:')
  const handlers = createHandlers(() => ({ db, libraryRoot: '/test' }), null)
  assert.deepEqual(handlers['library:info']().data, { libraryRoot: '/test', source: 'test library', canChange: false })
  assert.match((await handlers['library:choose']()).error, /test library/)
  assert.match(handlers['library:import']().error, /test library/)
})
