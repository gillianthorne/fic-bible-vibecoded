// Beat writes. Needs the Electron-built SQLite module: run through `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { openSqlite } from '../src/main/sqlite.js'
import { migrate } from '../src/main/migrate.js'
import { createHandlers } from '../src/main/handlers.js'
import { createBeat, deleteBeat, moveBeat, updateBeat } from '../src/main/edit.js'

const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url))

// One work, one chapter, two scenes; returns the db and the scene ids.
function setup() {
  const db = openSqlite(':memory:')
  migrate(db, MIGRATIONS)
  db.exec(`
    INSERT INTO works (id, title, folder) VALUES (1, 'W', 'W');
    INSERT INTO chapters (id, work_id, number, title, folder) VALUES (1, 1, 1, 'C', '01-C');
    INSERT INTO scenes (id, chapter_id, position, title, filename, pov) VALUES
      (1, 1, 1, 'S1', '01-s1.md', ''), (2, 1, 2, 'S2', '02-s2.md', '');
  `)
  return db
}

const beats = (db, sceneId = 1) =>
  db
    .prepare('SELECT position, kind, content, status, paragraph_ref AS ref FROM beats WHERE scene_id = ? ORDER BY position')
    .all(sceneId)

const contents = (db, sceneId = 1) => beats(db, sceneId).map((b) => b.content)

function withBeats(db, ...names) {
  return names.map((content) => createBeat(db, 1, { kind: 'plot', content }))
}

test('createBeat adds at the end with defaults', () => {
  const db = setup()
  createBeat(db, 1, { kind: ' plot ', content: 'First' })
  createBeat(db, 1, { kind: 'line', content: 'Second', status: 'in draft', paragraphRef: 3 })
  createBeat(db, 2, { kind: 'plot', content: 'Other scene' })
  assert.deepEqual(beats(db), [
    { position: 1, kind: 'plot', content: 'First', status: 'planned', ref: null },
    { position: 2, kind: 'line', content: 'Second', status: 'in draft', ref: 3 }
  ])
  assert.deepEqual(beats(db, 2).map((b) => b.position), [1])
})

test('createBeat validates', () => {
  const db = setup()
  assert.throws(() => createBeat(db, 1, { content: 'x' }), /needs a kind/)
  assert.throws(() => createBeat(db, 1, { kind: 'plot' }), /needs a content/)
  assert.throws(() => createBeat(db, 1, { kind: '  ', content: 'x' }), /Kind can’t be blank/)
  assert.throws(() => createBeat(db, 1, { kind: 'plot', content: '\n ' }), /Beat can’t be blank/)
  assert.throws(() => createBeat(db, 1, { kind: 'plot', content: 'x', status: 'done' }), /Status must be one of/)
  assert.throws(() => createBeat(db, 1, { kind: 'plot', content: 'x', paragraphRef: 0 }), /Paragraph must be a whole number/)
  assert.throws(() => createBeat(db, 1, { kind: 'plot', content: 'x', paragraphRef: 1.5 }), /whole number/)
  assert.throws(() => createBeat(db, 1, { kind: 'plot', content: 'x', position: 4 }), /no editable field “position”/)
  assert.throws(() => createBeat(db, 99, { kind: 'plot', content: 'x' }), /Scene 99 not found/)
  assert.deepEqual(beats(db), [])
})

test('updateBeat changes only the fields given, and can clear the paragraph', () => {
  const db = setup()
  const [id] = withBeats(db, 'Original')
  updateBeat(db, id, { paragraphRef: 4 })
  updateBeat(db, id, { content: 'Line one\nLine two  ', status: 'cut' })
  assert.deepEqual(beats(db), [{ position: 1, kind: 'plot', content: 'Line one\nLine two  ', status: 'cut', ref: 4 }])
  updateBeat(db, id, { paragraphRef: null })
  assert.equal(beats(db)[0].ref, null)
  assert.throws(() => updateBeat(db, id, {}), /No Beat changes/)
  assert.throws(() => updateBeat(db, id, { scene_id: 2 }), /no editable field/)
  assert.throws(() => updateBeat(db, 99, { content: 'x' }), /Beat 99 not found/)
})

test('moveBeat swaps with the neighbour and stops at the ends', () => {
  const db = setup()
  const [a, b, c] = withBeats(db, 'A', 'B', 'C')
  moveBeat(db, c, 'up')
  assert.deepEqual(contents(db), ['A', 'C', 'B'])
  moveBeat(db, a, 'down')
  assert.deepEqual(contents(db), ['C', 'A', 'B'])
  moveBeat(db, c, 'up')
  moveBeat(db, b, 'down')
  assert.deepEqual(contents(db), ['C', 'A', 'B'])
  assert.deepEqual(beats(db).map((x) => x.position), [1, 2, 3])
  assert.throws(() => moveBeat(db, a, 'sideways'), /Direction must be one of/)
})

test('deleteBeat closes the gap and leaves other scenes alone', () => {
  const db = setup()
  const [a, b] = withBeats(db, 'A', 'B', 'C', 'D')
  createBeat(db, 2, { kind: 'plot', content: 'Other' })
  deleteBeat(db, b)
  assert.deepEqual(beats(db).map((x) => [x.position, x.content]), [[1, 'A'], [2, 'C'], [3, 'D']])
  deleteBeat(db, a)
  assert.deepEqual(beats(db).map((x) => [x.position, x.content]), [[1, 'C'], [2, 'D']])
  assert.deepEqual(contents(db, 2), ['Other'])
  assert.throws(() => deleteBeat(db, a), /not found/)
})

test('beat handlers wrap errors as { ok: false }', () => {
  const db = setup()
  const handlers = createHandlers(() => ({ db, libraryRoot: '/x' }))
  const created = handlers['beat:create'](1, { kind: 'plot', content: 'A' })
  assert.equal(created.ok, true)
  assert.deepEqual(handlers['beat:update'](created.data, { status: 'in draft' }), { ok: true, data: null })
  assert.deepEqual(handlers['beat:move'](created.data, 'down'), { ok: true, data: null })
  assert.match(handlers['beat:create'](1, { kind: '' }).error, /blank/)
  assert.deepEqual(handlers['beat:delete'](created.data), { ok: true, data: null })
})
