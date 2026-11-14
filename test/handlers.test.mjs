// The IPC handlers against a freshly seeded temp library.
// Uses the Electron-built SQLite module: run through `npm test`.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MARKER } from '../scripts/seed/guard.mjs'
import { DB_NAME, seed } from '../scripts/seed/seed.mjs'
import { openSqlite } from '../src/main/sqlite.js'
import { createHandlers } from '../src/main/handlers.js'

let root
let db
let handlers

before(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fic-bible-handlers-')))
  fs.writeFileSync(path.join(root, MARKER), '')
  seed(root)
  db = openSqlite(path.join(root, DB_NAME))
  handlers = createHandlers(() => ({ db, libraryRoot: root }))
})

after(() => db.close())

const chapterId = (title) => db.prepare('SELECT id FROM chapters WHERE title = ?').pluck().get(title)

test('nav:tree wraps the navigation tree', () => {
  const result = handlers['nav:tree']()
  assert.equal(result.ok, true)
  assert.equal(result.data.length, 3)
})

test('library:overview returns every work and the total across them', () => {
  const result = handlers['library:overview']()
  assert.equal(result.ok, true)
  assert.equal(result.data.works.length, 3)
  assert.equal(result.data.wordcount, result.data.works.reduce((sum, w) => sum + w.wordcount, 0))
})

test('work:overview returns chapters, null for an unknown work, and refuses bad ids', () => {
  const workId = db.prepare("SELECT id FROM works WHERE title = 'Salt and Static'").pluck().get()
  const result = handlers['work:overview'](workId)
  assert.equal(result.ok, true)
  assert.ok(result.data.chapters.length > 0)
  assert.deepEqual(handlers['work:overview'](9999), { ok: true, data: null })
  assert.equal(handlers['work:overview']('1').ok, false)
})

test('chapter:overview returns scenes and a file-derived total', () => {
  const result = handlers['chapter:overview'](chapterId('Signal'))
  assert.equal(result.ok, true)
  const { scenes, wordcount, uncounted } = result.data
  assert.ok(scenes.length > 0)
  assert.equal(uncounted, 0)
  assert.equal(wordcount, scenes.reduce((sum, s) => sum + s.wordcount, 0))
})

test('chapter:overview gives null data for an unknown chapter', () => {
  assert.deepEqual(handlers['chapter:overview'](999999), { ok: true, data: null })
})

test('chapter:overview refuses anything but a positive integer', () => {
  for (const bad of [0, -1, 1.5, '1', null, undefined, NaN, {}]) {
    const result = handlers['chapter:overview'](bad)
    assert.equal(result.ok, false, `accepted ${String(bad)}`)
    assert.match(result.error, /chapterId must be a positive integer/)
  }
})

test('a failure to open becomes an error result, not a throw', () => {
  const broken = createHandlers(() => {
    throw new Error('database not ready')
  })
  assert.deepEqual(broken['nav:tree'](), { ok: false, error: 'database not ready' })
  assert.deepEqual(broken['chapter:overview'](1), { ok: false, error: 'database not ready' })
  assert.deepEqual(broken['scene:detail'](1), { ok: false, error: 'database not ready' })
})

test('a missing scene file is reported per scene and in the total', () => {
  const id = chapterId('Signal')
  const before = handlers['chapter:overview'](id).data
  const victim = db
    .prepare(
      `SELECT w.folder AS w, c.folder AS c, s.filename AS f FROM scenes s
       JOIN chapters c ON c.id = s.chapter_id JOIN works w ON w.id = c.work_id
       WHERE c.id = ? ORDER BY s.position LIMIT 1`
    )
    .get(id)
  const file = path.join(root, victim.w, victim.c, victim.f)
  fs.renameSync(file, file + '.moved')
  try {
    const after = handlers['chapter:overview'](id).data
    assert.equal(after.scenes[0].wordcount, null)
    assert.equal(after.scenes[0].fileError, 'ENOENT')
    assert.equal(after.uncounted, 1)
    assert.equal(after.wordcount, before.wordcount - before.scenes[0].wordcount)
  } finally {
    fs.renameSync(file + '.moved', file)
  }
})

const firstSceneId = (chapterTitle) =>
  db
    .prepare(
      `SELECT s.id FROM scenes s JOIN chapters c ON c.id = s.chapter_id
       WHERE c.title = ? ORDER BY s.position LIMIT 1`
    )
    .pluck()
    .get(chapterTitle)

test('scene:detail returns the scene, its file-derived wordcount and its beats', () => {
  const result = handlers['scene:detail'](firstSceneId('Signal'))
  assert.equal(result.ok, true)
  const scene = result.data
  assert.equal(scene.position, 1)
  assert.equal(scene.fileError, null)
  assert.equal(typeof scene.wordcount, 'number')
  assert.ok(scene.beats.length > 0)
  assert.deepEqual(scene.beats.map((b) => b.position), scene.beats.map((_, i) => i + 1))
})

test('scene:detail gives null data for an unknown scene', () => {
  assert.deepEqual(handlers['scene:detail'](999999), { ok: true, data: null })
})

test('scene:detail refuses anything but a positive integer', () => {
  for (const bad of [0, -1, 1.5, '1', null, undefined, NaN, {}]) {
    const result = handlers['scene:detail'](bad)
    assert.equal(result.ok, false, `accepted ${String(bad)}`)
    assert.match(result.error, /sceneId must be a positive integer/)
  }
})

test('scene:prose returns the paragraphs scene:detail counts', () => {
  const id = firstSceneId('Signal')
  const result = handlers['scene:prose'](id)
  assert.equal(result.ok, true)
  assert.equal(result.data.fileError, null)
  assert.equal(result.data.paragraphs.length, handlers['scene:detail'](id).data.paragraphs)
})

test('scene:prose gives null data for an unknown scene and refuses bad ids', () => {
  assert.deepEqual(handlers['scene:prose'](999999), { ok: true, data: null })
  for (const bad of [0, -1, 1.5, '1', null, undefined, NaN, {}]) {
    const result = handlers['scene:prose'](bad)
    assert.equal(result.ok, false, `accepted ${String(bad)}`)
    assert.match(result.error, /sceneId must be a positive integer/)
  }
})
