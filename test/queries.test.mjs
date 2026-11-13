// Runs the queries against a freshly seeded temp library.
// Uses the Electron-built SQLite module: run through `npm test`.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MARKER } from '../scripts/seed/guard.mjs'
import { DB_NAME, seed } from '../scripts/seed/seed.mjs'
import { openSqlite } from '../src/main/sqlite.js'
import { countProse } from '../src/main/prose.js'
import { chapterOverview, navigationTree, sceneDetail, suggestions, workWordcount } from '../src/main/queries.js'

let root
let db

before(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fic-bible-queries-')))
  fs.writeFileSync(path.join(root, MARKER), '')
  seed(root)
  db = openSqlite(path.join(root, DB_NAME))
})

after(() => db.close())

const sceneId = (workTitle, chapterNumber, position) =>
  db
    .prepare(
      `SELECT s.id FROM scenes s JOIN chapters c ON c.id = s.chapter_id JOIN works w ON w.id = c.work_id
       WHERE w.title = ? AND c.number = ? AND s.position = ?`
    )
    .pluck()
    .get(workTitle, chapterNumber, position)

test('navigation tree nests everything in order, including the empty work', () => {
  const tree = navigationTree(db)
  assert.deepEqual(tree.map((w) => w.title), ['Salt and Static', 'The Lantern Road', 'Untitled Orchard Idea'])
  assert.deepEqual(tree[2].chapters, [])
  const lantern = tree[1]
  assert.deepEqual(lantern.chapters.map((c) => c.number), [1, 2, 3])
  assert.equal(lantern.chapters[1].scenes.length, 1)
  for (const ch of lantern.chapters) {
    assert.deepEqual(ch.scenes.map((s) => s.position), ch.scenes.map((_, i) => i + 1))
    for (const s of ch.scenes) assert.ok(s.status)
  }
})

test('chapter total is the sum of file-derived scene counts', () => {
  const chapterId = db.prepare("SELECT id FROM chapters WHERE title = 'Signal'").pluck().get()
  const overview = chapterOverview(db, root, chapterId)
  assert.equal(overview.scenes.length, 6)
  assert.equal(overview.uncounted, 0)
  assert.equal(overview.wordcount, overview.scenes.reduce((sum, s) => sum + s.wordcount, 0))
  for (const s of overview.scenes) {
    const file = path.join(root, 'salt-and-static', 'chapter-01', `scene-${String(s.position).padStart(2, '0')}.md`)
    assert.equal(s.wordcount, countProse(fs.readFileSync(file, 'utf8')).words)
    assert.equal(s.beats.total, s.beats.planned + s.beats.inDraft + s.beats.cut)
  }
})

test('a scene with no beats has all-zero beat counts', () => {
  const chapterId = db.prepare("SELECT id FROM chapters WHERE title = 'The Tide Tables'").pluck().get()
  const scene = chapterOverview(db, root, chapterId).scenes.find((s) => s.position === 2)
  assert.deepEqual(scene.beats, { total: 0, planned: 0, inDraft: 0, cut: 0 })
})

test('an empty scene file counts as zero words, not an error', () => {
  const detail = sceneDetail(db, root, sceneId('Salt and Static', 5, 2))
  assert.equal(detail.wordcount, 0)
  assert.equal(detail.paragraphs, 0)
  assert.equal(detail.fileError, null)
})

test('the CRLF scene counts the same as its LF text', () => {
  const detail = sceneDetail(db, root, sceneId('The Lantern Road', 1, 2))
  const raw = fs.readFileSync(detail.path, 'utf8')
  assert.ok(raw.includes('\r\n'))
  assert.deepEqual(
    { words: detail.wordcount, paragraphs: detail.paragraphs },
    countProse(raw.replace(/\r\n/g, '\n'))
  )
})

test('scene detail returns beats in order with refs inside the file', () => {
  const detail = sceneDetail(db, root, sceneId('Salt and Static', 1, 1))
  assert.deepEqual(detail.beats.map((b) => b.position), detail.beats.map((_, i) => i + 1))
  for (const b of detail.beats) {
    if (b.paragraphRef !== null) assert.ok(b.paragraphRef <= detail.paragraphs)
  }
})

test('a missing scene file is reported, not thrown, and left out of totals', () => {
  const id = sceneId('The Lantern Road', 3, 1)
  const detail = sceneDetail(db, root, id)
  const hidden = detail.path + '.hidden'
  fs.renameSync(detail.path, hidden)
  try {
    assert.equal(sceneDetail(db, root, id).fileError, 'ENOENT')
    const chapterId = sceneDetail(db, root, id).chapter.id
    const overview = chapterOverview(db, root, chapterId)
    assert.equal(overview.uncounted, 1)
  } finally {
    fs.renameSync(hidden, detail.path)
  }
})

test('work total is the sum of chapter totals; empty work is zero', () => {
  const workId = db.prepare("SELECT id FROM works WHERE title = 'Salt and Static'").pluck().get()
  const work = workWordcount(db, root, workId)
  const chapterIds = db.prepare('SELECT id FROM chapters WHERE work_id = ? ORDER BY number').pluck().all(workId)
  const totals = chapterIds.map((id) => chapterOverview(db, root, id).wordcount)
  assert.deepEqual(work.chapters.map((c) => c.wordcount), totals)
  assert.equal(work.wordcount, totals.reduce((a, b) => a + b, 0))

  const empty = db.prepare("SELECT id FROM works WHERE title = 'Untitled Orchard Idea'").pluck().get()
  assert.deepEqual(workWordcount(db, root, empty), { workId: empty, wordcount: 0, uncounted: 0, chapters: [] })
})

test('suggestions are distinct, most used first', () => {
  const { kinds, povs } = suggestions(db)
  for (const list of [kinds, povs]) {
    assert.equal(new Set(list.map((x) => x.value)).size, list.length)
    for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].count >= list[i].count)
  }
  assert.equal(kinds.reduce((s, k) => s + k.count, 0), db.prepare('SELECT count(*) FROM beats').pluck().get())
})

test('unknown ids give null', () => {
  assert.equal(chapterOverview(db, root, 9999), null)
  assert.equal(sceneDetail(db, root, 9999), null)
})
