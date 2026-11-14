// Edit note writes and reads. Needs the Electron-built SQLite module: run through `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { openSqlite } from '../src/main/sqlite.js'
import { migrate } from '../src/main/migrate.js'
import { createHandlers } from '../src/main/handlers.js'
import { createEditNote, deleteEditNote, updateEditNote } from '../src/main/edit.js'
import { editNotes, suggestions } from '../src/main/queries.js'

const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url))

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

const strip = (notes) => notes.map(({ id, ...rest }) => rest)

test('createEditNote adds with defaults, listed by paragraph then order added', () => {
  const db = setup()
  createEditNote(db, 1, { paragraph: 4, note: 'Tense slips' })
  createEditNote(db, 1, { paragraph: 2, kind: ' typo ', note: 'teh', status: 'fixed' })
  createEditNote(db, 1, { paragraph: 4, kind: 'pacing', note: 'Drags\nhere' })
  createEditNote(db, 2, { paragraph: 1, note: 'Other scene' })
  assert.deepEqual(strip(editNotes(db, 1)), [
    { paragraph: 2, kind: 'typo', note: 'teh', status: 'fixed' },
    { paragraph: 4, kind: '', note: 'Tense slips', status: 'open' },
    { paragraph: 4, kind: 'pacing', note: 'Drags\nhere', status: 'open' }
  ])
  assert.equal(editNotes(db, 2).length, 1)
})

test('createEditNote validates', () => {
  const db = setup()
  assert.throws(() => createEditNote(db, 1, { note: 'x' }), /needs a paragraph/)
  assert.throws(() => createEditNote(db, 1, { paragraph: 1 }), /needs a note/)
  assert.throws(() => createEditNote(db, 1, { paragraph: 1, note: ' \n' }), /Note can’t be blank/)
  assert.throws(() => createEditNote(db, 1, { paragraph: 0, note: 'x' }), /Paragraph must be a whole number/)
  assert.throws(() => createEditNote(db, 1, { paragraph: null, note: 'x' }), /Paragraph must be a whole number/)
  assert.throws(() => createEditNote(db, 1, { paragraph: 1, note: 'x', status: 'done' }), /Status must be one of/)
  assert.throws(() => createEditNote(db, 1, { paragraph: 1, note: 'x', position: 1 }), /no editable field “position”/)
  assert.throws(() => createEditNote(db, 99, { paragraph: 1, note: 'x' }), /Scene 99 not found/)
  assert.deepEqual(editNotes(db, 1), [])
})

test('updateEditNote changes only the fields given', () => {
  const db = setup()
  const id = createEditNote(db, 1, { paragraph: 3, kind: 'typo', note: 'teh' })
  updateEditNote(db, id, { status: 'ignored' })
  updateEditNote(db, id, { paragraph: 5, kind: '' })
  assert.deepEqual(strip(editNotes(db, 1)), [{ paragraph: 5, kind: '', note: 'teh', status: 'ignored' }])
  assert.throws(() => updateEditNote(db, id, {}), /No Edit note changes/)
  assert.throws(() => updateEditNote(db, id, { status: 'open ' }), /Status must be one of/)
  assert.throws(() => updateEditNote(db, 99, { status: 'fixed' }), /Edit note 99 not found/)
})

test('deleteEditNote removes the row; deleting a scene removes its notes', () => {
  const db = setup()
  const a = createEditNote(db, 1, { paragraph: 1, note: 'a' })
  createEditNote(db, 1, { paragraph: 2, note: 'b' })
  createEditNote(db, 2, { paragraph: 1, note: 'c' })
  deleteEditNote(db, a)
  assert.deepEqual(editNotes(db, 1).map((n) => n.note), ['b'])
  db.prepare('DELETE FROM scenes WHERE id = 1').run()
  assert.equal(db.prepare('SELECT count(*) FROM edit_notes').pluck().get(), 1)
})

test('edit-note kinds are suggested apart from beat kinds, blanks left out', () => {
  const db = setup()
  db.exec("INSERT INTO beats (scene_id, position, kind, content) VALUES (1, 1, 'plot', 'x')")
  createEditNote(db, 1, { paragraph: 1, kind: 'typo', note: 'a' })
  createEditNote(db, 1, { paragraph: 2, kind: 'typo', note: 'b' })
  createEditNote(db, 1, { paragraph: 3, note: 'c' })
  const s = suggestions(db)
  assert.deepEqual(s.editKinds, [{ value: 'typo', count: 2 }])
  assert.deepEqual(s.kinds, [{ value: 'plot', count: 1 }])
})

test('edit note handlers return { ok } results', () => {
  const db = setup()
  const h = createHandlers(() => ({ db, libraryRoot: '/nowhere' }))
  const created = h['editNote:create'](1, { paragraph: 2, note: 'x' })
  assert.equal(created.ok, true)
  assert.deepEqual(h['editNote:update'](created.data, { status: 'cut' }), { ok: true, data: null })
  assert.deepEqual(strip(h['editNote:list'](1).data), [{ paragraph: 2, kind: '', note: 'x', status: 'cut' }])
  assert.equal(h['editNote:create'](1, { note: 'x' }).ok, false)
  assert.equal(h['editNote:list']('1').ok, false)
  assert.deepEqual(h['editNote:delete'](created.data), { ok: true, data: null })
  assert.deepEqual(h['editNote:list'](1).data, [])
})
