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
import { migrate } from '../src/main/migrate.js'
import { updateWork } from '../src/main/edit.js'
import {
  chapterOverview,
  chapterProse,
  libraryOverview,
  navigationTree,
  sceneDetail,
  sceneProse,
  suggestions,
  workOverview,
  workWordcount
} from '../src/main/queries.js'

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

test('scene detail knows how many scenes its chapter has', () => {
  assert.equal(sceneDetail(db, root, sceneId('Salt and Static', 1, 3)).chapterSceneCount, 6)
  assert.equal(sceneDetail(db, root, sceneId('The Lantern Road', 2, 1)).chapterSceneCount, 1)
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

test('work overview lists chapters in order with the same totals as their overviews', () => {
  const workId = db.prepare("SELECT id FROM works WHERE title = 'Salt and Static'").pluck().get()
  db.prepare("UPDATE works SET url = 'https://archiveofourown.org/works/1', notes = 'Inspo' WHERE id = ?").run(workId)
  try {
    const overview = workOverview(db, root, workId)
    assert.deepEqual(overview.work, {
      id: workId,
      title: 'Salt and Static',
      url: 'https://archiveofourown.org/works/1',
      notes: 'Inspo',
      fandom: null,
      ship: null
    })
    const chapterIds = db.prepare('SELECT id FROM chapters WHERE work_id = ? ORDER BY number').pluck().all(workId)
    assert.deepEqual(overview.chapters.map((c) => c.id), chapterIds)
    for (const ch of overview.chapters) {
      const detail = chapterOverview(db, root, ch.id)
      assert.deepEqual(
        [ch.number, ch.title, ch.status, ch.postedUrl, ch.wordcount, ch.uncounted],
        [detail.chapter.number, detail.chapter.title, detail.chapter.status, detail.chapter.postedUrl, detail.wordcount, detail.uncounted]
      )
    }
    assert.equal(overview.wordcount, workWordcount(db, root, workId).wordcount)
    assert.equal(overview.uncounted, 0)
  } finally {
    db.prepare('UPDATE works SET url = NULL, notes = NULL WHERE id = ?').run(workId)
  }
})

test('work overview of an empty work has no chapters and zero words', () => {
  const workId = db.prepare("SELECT id FROM works WHERE title = 'Untitled Orchard Idea'").pluck().get()
  const overview = workOverview(db, root, workId)
  assert.deepEqual(overview.chapters, [])
  assert.equal(overview.wordcount, 0)
  assert.equal(overview.work.url, null)
})

test('library overview lists every work in sidebar order with its own total', () => {
  const library = libraryOverview(db, root)
  assert.deepEqual(library.works.map((w) => w.title), navigationTree(db).map((w) => w.title))
  for (const work of library.works) {
    const own = workWordcount(db, root, work.id)
    assert.deepEqual([work.wordcount, work.uncounted], [own.wordcount, own.uncounted])
    assert.equal(work.chapterCount, own.chapters.length)
    assert.equal(work.url, null)
  }
  assert.equal(library.wordcount, library.works.reduce((sum, w) => sum + w.wordcount, 0))
  assert.ok(library.wordcount > 0)
  assert.equal(library.uncounted, 0)
})

test('library overview of an empty library is zero, not an error', () => {
  const empty = openSqlite(':memory:')
  try {
    migrate(empty, path.join(import.meta.dirname, '..', 'migrations'))
    assert.deepEqual(libraryOverview(empty, root), { works: [], wordcount: 0, uncounted: 0 })
  } finally {
    empty.close()
  }
})

test('library overview groups works by fandom, with no fandom last, and names their ships', () => {
  const ids = Object.fromEntries(db.prepare('SELECT title, id FROM works').all().map((w) => [w.title, w.id]))
  updateWork(db, ids['Untitled Orchard Idea'], { fandom: 'Alpha Fandom', ship: 'A/B' })
  updateWork(db, ids['The Lantern Road'], { fandom: 'Alpha Fandom' })
  try {
    const { works } = libraryOverview(db, root)
    assert.deepEqual(
      works.map((w) => [w.title, w.fandom, w.ship]),
      [
        ['The Lantern Road', 'Alpha Fandom', null],
        ['Untitled Orchard Idea', 'Alpha Fandom', 'A/B'],
        ['Salt and Static', null, null]
      ]
    )
    assert.equal(workOverview(db, root, ids['Untitled Orchard Idea']).work.ship, 'A/B')
    const { fandoms, ships } = suggestions(db)
    assert.deepEqual(fandoms, ['Alpha Fandom'])
    assert.deepEqual(ships, [{ name: 'A/B', fandom: 'Alpha Fandom' }])
  } finally {
    for (const id of Object.values(ids)) updateWork(db, id, { fandom: null })
  }
  assert.deepEqual(suggestions(db).fandoms, [])
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
  assert.equal(workOverview(db, root, 9999), null)
})

const allSceneIds = () => db.prepare('SELECT id FROM scenes ORDER BY id').pluck().all()

test('scene prose has exactly as many paragraphs as scene detail counts, for every scene', () => {
  for (const id of allSceneIds()) {
    const prose = sceneProse(db, root, id)
    assert.equal(prose.fileError, null)
    assert.equal(prose.paragraphs.length, sceneDetail(db, root, id).paragraphs, `scene ${id}`)
  }
})

test('scene prose has the same wordcount as scene detail, for every scene', () => {
  for (const id of allSceneIds()) {
    assert.equal(sceneProse(db, root, id).wordcount, sceneDetail(db, root, id).wordcount, `scene ${id}`)
  }
})

test('every seeded paragraph_ref points at a paragraph the viewer shows', () => {
  let checked = 0
  for (const id of allSceneIds()) {
    const { paragraphs } = sceneProse(db, root, id)
    for (const b of sceneDetail(db, root, id).beats) {
      if (b.paragraphRef === null) continue
      assert.ok(b.paragraphRef >= 1 && b.paragraphRef <= paragraphs.length, `scene ${id} ref ${b.paragraphRef}`)
      checked++
    }
  }
  assert.ok(checked > 0)
})

test('scene prose links each scene to its neighbours, across chapter ends', () => {
  const workId = db.prepare("SELECT id FROM works WHERE title = 'The Lantern Road'").pluck().get()
  const order = db
    .prepare(
      `SELECT s.id FROM scenes s JOIN chapters c ON c.id = s.chapter_id
       WHERE c.work_id = ? ORDER BY c.number, s.position`
    )
    .pluck()
    .all(workId)
  assert.ok(order.length > 2)
  order.forEach((id, i) => {
    const { previous, next } = sceneProse(db, root, id)
    assert.equal(previous?.id ?? null, order[i - 1] ?? null, `scene ${id} previous`)
    assert.equal(next?.id ?? null, order[i + 1] ?? null, `scene ${id} next`)
  })
  // Chapter 1's last scene leads into chapter 2's first.
  const lastOfOne = sceneProse(db, root, sceneId('The Lantern Road', 1, 4))
  assert.deepEqual([lastOfOne.next.chapterNumber, lastOfOne.next.position], [2, 1])
})

test('chapter prose has every scene in order, matching the single-scene viewer', () => {
  const chapterId = db.prepare("SELECT id FROM chapters WHERE title = 'Signal'").pluck().get()
  const prose = chapterProse(db, root, chapterId)
  const overview = chapterOverview(db, root, chapterId)
  assert.deepEqual(prose.scenes.map((s) => s.id), overview.scenes.map((s) => s.id))
  for (const scene of prose.scenes) {
    const single = sceneProse(db, root, scene.id)
    assert.deepEqual([scene.paragraphs, scene.wordcount, scene.fileError], [single.paragraphs, single.wordcount, single.fileError])
  }
  assert.deepEqual([prose.wordcount, prose.uncounted], [overview.wordcount, overview.uncounted])
})

test('chapter prose links to the chapters either side', () => {
  const ids = db
    .prepare("SELECT c.id FROM chapters c JOIN works w ON w.id = c.work_id WHERE w.title = 'Salt and Static' ORDER BY c.number")
    .pluck()
    .all()
  ids.forEach((id, i) => {
    const { previous, next } = chapterProse(db, root, id)
    assert.equal(previous?.id ?? null, ids[i - 1] ?? null)
    assert.equal(next?.id ?? null, ids[i + 1] ?? null)
  })
  assert.equal(chapterProse(db, root, 9999), null)
})

test('scene prose of the CRLF scene matches its LF text, with no CR left in', () => {
  const prose = sceneProse(db, root, sceneId('The Lantern Road', 1, 2))
  const raw = fs.readFileSync(prose.path, 'utf8')
  assert.ok(raw.includes('\r\n'))
  assert.ok(prose.paragraphs.length > 1)
  assert.deepEqual(prose.paragraphs, raw.replace(/\r\n/g, '\n').split('\n\n').map((p) => p.trim()).filter(Boolean))
  for (const p of prose.paragraphs) assert.ok(!p.includes('\r'))
})

test('scene prose of an empty file is an empty list, not an error', () => {
  const prose = sceneProse(db, root, sceneId('Salt and Static', 5, 2))
  assert.deepEqual(prose.paragraphs, [])
  assert.equal(prose.fileError, null)
})

test('reading scene prose leaves the file byte-for-byte unchanged', () => {
  for (const id of [sceneId('The Lantern Road', 1, 2), sceneId('Salt and Static', 5, 2)]) {
    const file = sceneProse(db, root, id).path
    const before = { bytes: fs.readFileSync(file), mtime: fs.statSync(file).mtimeMs }
    sceneProse(db, root, id)
    assert.deepEqual(fs.readFileSync(file), before.bytes)
    assert.equal(fs.statSync(file).mtimeMs, before.mtime)
  }
})

test('scene prose is null for an unknown scene and reports a missing file', () => {
  assert.equal(sceneProse(db, root, 999999), null)
  const id = sceneId('The Lantern Road', 3, 1)
  const file = sceneProse(db, root, id).path
  fs.renameSync(file, file + '.hidden')
  try {
    assert.deepEqual(
      { paragraphs: sceneProse(db, root, id).paragraphs, fileError: sceneProse(db, root, id).fileError },
      { paragraphs: null, fileError: 'ENOENT' }
    )
  } finally {
    fs.renameSync(file + '.hidden', file)
  }
})
