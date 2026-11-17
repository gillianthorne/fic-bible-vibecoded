// A work's notes: the line dictionary, the timeline, and note page rows.
// Needs the Electron-built SQLite module: run through `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openSqlite } from '../src/main/sqlite.js'
import { migrate } from '../src/main/migrate.js'
import { createChapter, createCharacter, createNotePage, createScene, createWork } from '../src/main/create.js'
import { importLibrary } from '../src/main/import.js'
import { navigationTree } from '../src/main/queries.js'
import { readNotePage, saveNotePage } from '../src/main/save.js'
import { createBeat } from '../src/main/edit.js'
import {
  createLine,
  createTimelineEvent,
  deleteLine,
  deleteNotePage,
  deleteTimelineEvent,
  lineDictionary,
  moveNotePage,
  moveTimelineEvent,
  renameNotePage,
  timeline,
  updateLine,
  updateTimelineEvent
} from '../src/main/notes.js'

const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url))

function setup() {
  const db = openSqlite(':memory:')
  migrate(db, MIGRATIONS)
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fic-bible-notes-')))
  const workId = createWork(db, root, 'Hockey AU')
  const ch1 = createChapter(db, root, workId, 'Camp')
  const ch2 = createChapter(db, root, workId, 'Preseason')
  const s1 = createScene(db, root, ch1, 'Arrival')
  const s2 = createScene(db, root, ch2, 'Bus')
  const beat = createBeat(db, s1, { kind: 'line', content: 'The first refrain' })
  createCharacter(db, root, workId, 'Laura Stacey')
  createCharacter(db, root, workId, 'Marie-Philip')
  const other = createWork(db, root, 'Other')
  const otherChapter = createChapter(db, root, other, 'Elsewhere')
  return { db, root, workId, ch1, ch2, s1, s2, beat, other, otherChapter }
}

test('lines group by type, then run in chapter and scene order, unplaced last', () => {
  const { db, workId, ch1, ch2, s1, s2, beat } = setup()
  const a = createLine(db, workId, { line: 'You’re late.', type: 'refrain 1', speaker: 'Marie-Philip', chapterId: ch2, sceneId: s2 })
  const b = createLine(db, workId, { line: 'You’re late.', type: 'refrain 1', chapterId: ch1, sceneId: s1, beatId: beat, status: 'used' })
  const c = createLine(db, workId, { line: 'Nice hands', type: 'ch 1 chirps', speaker: 'Laura Stacey', notes: 'maybe' })
  const d = createLine(db, workId, { line: 'Untyped', chapterId: ch1 })
  const e = createLine(db, workId, { line: 'Floating', type: 'refrain 1' })
  const dict = lineDictionary(db, workId)
  assert.deepEqual(dict.lines.map((l) => l.id), [c, b, a, e, d])
  const used = dict.lines[1]
  assert.deepEqual(
    { status: used.status, chapter: used.chapter, scene: used.scene, beat: used.beat?.content },
    {
      status: 'used',
      chapter: { id: ch1, number: 1, title: 'Camp' },
      scene: { id: s1, position: 1, title: 'Arrival' },
      beat: 'The first refrain'
    }
  )
  assert.deepEqual(dict.lines[0].notes, 'maybe')
  assert.equal(dict.lines[3].chapter, null)
  assert.deepEqual(dict.chapters.map((ch) => [ch.title, ch.scenes.map((s) => [s.title, s.beats.length])]), [
    ['Camp', [['Arrival', 1]]],
    ['Preseason', [['Bus', 0]]]
  ])
  assert.deepEqual(dict.suggestions.types, [{ value: 'refrain 1', count: 3 }, { value: 'ch 1 chirps', count: 1 }])
  assert.deepEqual(dict.suggestions.speakers, [
    { value: 'Laura Stacey', count: 1 },
    { value: 'Marie-Philip', count: 1 }
  ])
  assert.equal(lineDictionary(db, 999), null)
})

test('a line’s chapter, scene and beat must fit together, in its own work', () => {
  const { db, workId, ch1, ch2, s1, s2, beat, otherChapter } = setup()
  assert.throws(() => createLine(db, workId, { line: 'x', sceneId: s1 }), /scene needs a chapter/)
  assert.throws(() => createLine(db, workId, { line: 'x', chapterId: ch1, beatId: beat }), /beat needs a scene/)
  assert.throws(() => createLine(db, workId, { line: 'x', chapterId: ch2, sceneId: s1 }), /isn’t in the chosen chapter/)
  assert.throws(() => createLine(db, workId, { line: 'x', chapterId: ch2, sceneId: s2, beatId: beat }), /isn’t in the chosen scene/)
  assert.throws(() => createLine(db, workId, { line: 'x', chapterId: otherChapter }), /another work/)
  assert.throws(() => createLine(db, workId, { line: '  ' }), /Line can’t be blank/)
  assert.throws(() => createLine(db, workId, { line: 'x', status: 'cut' }), /Status must be one of: planned, used, dropped/)
  const id = createLine(db, workId, { line: 'x', chapterId: ch1, sceneId: s1 })
  assert.throws(() => updateLine(db, id, { chapterId: ch2 }), /isn’t in the chosen chapter/)
  updateLine(db, id, { chapterId: ch2, sceneId: s2, status: 'used', speaker: ' Laura Stacey ' })
  assert.deepEqual(
    db.prepare('SELECT chapter_id, scene_id, status, speaker FROM lines WHERE id = ?').get(id),
    { chapter_id: ch2, scene_id: s2, status: 'used', speaker: 'Laura Stacey' }
  )
  updateLine(db, id, { chapterId: null, sceneId: null, beatId: null })
  deleteLine(db, id)
  assert.equal(db.prepare('SELECT count(*) FROM lines').pluck().get(), 0)
})

test('the timeline keeps the author’s order, with optional chapter links', () => {
  const { db, workId, ch1, otherChapter } = setup()
  const a = createTimelineEvent(db, workId, { event: 'Draft day', date: 'June 2024' })
  const b = createTimelineEvent(db, workId, { event: 'Camp opens', date: 'Day 1', chapterId: ch1 })
  const c = createTimelineEvent(db, workId, { event: 'First game', notes: 'the night before the final' })
  moveTimelineEvent(db, c, 'up')
  assert.deepEqual(timeline(db, workId).events.map((e) => e.id), [a, c, b])
  assert.deepEqual(timeline(db, workId).events[2].chapter, { id: ch1, number: 1, title: 'Camp' })
  updateTimelineEvent(db, b, { chapterId: null, date: '' })
  assert.equal(timeline(db, workId).events[2].chapter, null)
  assert.throws(() => updateTimelineEvent(db, b, { chapterId: otherChapter }), /another work/)
  assert.throws(() => createTimelineEvent(db, workId, { date: 'x' }), /needs an event/)
  deleteTimelineEvent(db, a)
  assert.deepEqual(timeline(db, workId).events.map((e) => [e.id, e.position]), [[c, 1], [b, 2]])
  assert.deepEqual(timeline(db, workId).chapters.map((ch) => ch.title), ['Camp', 'Preseason'])
  assert.equal(timeline(db, 999), null)
})

test('note pages: empty file on create, renamed in name only, saved under the guards, file kept on delete', () => {
  const { db, root, workId } = setup()
  const logline = createNotePage(db, root, workId, 'Logline')
  const thoughts = createNotePage(db, root, workId, 'random 3am thoughts')
  const dir = path.join(root, 'Hockey AU', 'notes')
  assert.deepEqual(fs.readdirSync(dir).sort(), ['Logline.md', 'random 3am thoughts.md'])
  assert.equal(fs.readFileSync(path.join(dir, 'Logline.md'), 'utf8'), '')

  renameNotePage(db, logline, 'Pitch')
  moveNotePage(db, thoughts, 'up')
  const tree = navigationTree(db).find((w) => w.id === workId)
  assert.deepEqual(tree.notePages.map((p) => p.name), ['random 3am thoughts', 'Pitch'])
  assert.ok(fs.existsSync(path.join(dir, 'Logline.md')))

  const opened = readNotePage(db, root, logline)
  assert.deepEqual([opened.name, opened.filename, opened.text], ['Pitch', 'Logline.md', ''])
  const pitch = ['# Pitch', '', 'Two rivals, one team.', ''].join('\n')
  const saved = saveNotePage(db, root, logline, pitch, opened.hash)
  assert.equal(saved.written, true)
  assert.equal(fs.readFileSync(path.join(dir, 'Logline.md'), 'utf8'), pitch)
  fs.writeFileSync(path.join(dir, 'Logline.md'), 'changed elsewhere')
  assert.throws(() => saveNotePage(db, root, logline, 'mine', saved.hash), /note page file has changed on disk/)
  assert.equal(fs.readFileSync(path.join(dir, 'Logline.md'), 'utf8'), 'changed elsewhere')

  assert.throws(() => createNotePage(db, root, workId, 'logline'), /already exists on disk/)
  assert.throws(() => renameNotePage(db, logline, '  '), /Name can’t be blank/)
  deleteNotePage(db, thoughts)
  assert.ok(fs.existsSync(path.join(dir, 'random 3am thoughts.md')))
  assert.deepEqual(navigationTree(db).find((w) => w.id === workId).notePages.map((p) => p.name), ['Pitch'])

  // A re-import brings the deleted page back, at the end; the rest stay.
  const { added } = importLibrary(db, root)
  assert.equal(added.notePages, 1)
  assert.deepEqual(navigationTree(db).find((w) => w.id === workId).notePages.map((p) => p.name), ['Pitch', 'random 3am thoughts'])
})
