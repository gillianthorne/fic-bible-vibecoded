// Searching every work's characters, notes and chapters. Needs the
// Electron-built SQLite module: run through `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openSqlite } from '../src/main/sqlite.js'
import { migrate } from '../src/main/migrate.js'
import { createChapter, createCharacter, createNotePage, createScene, createWork } from '../src/main/create.js'
import {
  createBeat,
  createCharacterField,
  createEditNote,
  updateChapter,
  updateCharacter,
  updateScene,
  updateWork
} from '../src/main/edit.js'
import { createLine, createTimelineEvent } from '../src/main/notes.js'
import { search } from '../src/main/search.js'

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
  return { db, root, notes, hockey, other }
}

// Adds a chapter with one scene to Hockey AU, and writes its prose.
function withChapter({ db, root, hockey }, prose = '') {
  const chapter = createChapter(db, root, hockey, 'Training Camp')
  const scene = createScene(db, root, chapter, 'Morning Skate')
  const file = db
    .prepare(
      `SELECT c.folder, s.filename FROM scenes s JOIN chapters c ON c.id = s.chapter_id WHERE s.id = ?`
    )
    .get(scene)
  const scenePath = path.join(root, 'Hockey AU', 'chapters', file.folder, file.filename)
  fs.writeFileSync(scenePath, prose)
  return { chapter, scene, scenePath }
}

const names = (result, section = 'characters') =>
  result.works.filter((w) => w[section].length > 0).map((w) => [w.title, w[section].map((c) => c.title)])

test('finds a value in any character field, ignoring case, across every work', () => {
  const { db, root } = setup()
  const result = search(db, root, '  bagel ')
  assert.equal(result.query, 'bagel')
  assert.deepEqual(names(result), [['Hockey AU', ['Laura Stacey', 'Marie']]])
  const [laura, marie] = result.works[0].characters
  assert.deepEqual(marie, {
    kind: 'character',
    id: marie.id,
    title: 'Marie',
    matches: [{ label: 'Bagel order', value: 'Everything, plain cream cheese' }]
  })
  assert.deepEqual(laura.matches, [{ label: 'Notes', value: 'Remembers her BAGEL order, toasted.' }])
})

test('matches names, birthdays, labels and notes, grouped by work in sidebar order', () => {
  const { db, root } = setup()
  assert.deepEqual(names(search(db, root, 'december')), [['Another Fic', ['Ana']]])
  assert.deepEqual(
    search(db, root, 'december').works[0].characters[0].matches.map((m) => m.label),
    ['Birthday', 'Notes']
  )
  assert.deepEqual(names(search(db, root, 'marie')), [['Hockey AU', ['Laura Stacey', 'Marie']]])
  assert.deepEqual(search(db, root, 'marie').works[0].characters[1].matches, [])
  assert.deepEqual(names(search(db, root, 'TIMS')), [['Hockey AU', ['Marie']]])
  assert.deepEqual(search(db, root, 'nothing like this').works, [])
  assert.deepEqual(search(db, root, '   ').works, [])
})

test('a long notes line is cut around the match; an unreadable notes file is reported', () => {
  const { db, root, notes } = setup()
  fs.writeFileSync(notes('Hockey AU', 'Marie'), `${'a'.repeat(300)} needle ${'b'.repeat(300)}`)
  const match = search(db, root, 'needle').works[0].characters[0].matches[0]
  assert.match(match.value, /^….*needle.*…$/)
  assert.ok(match.value.length <= 142)
  fs.rmSync(notes('Another Fic', 'Ana'))
  const result = search(db, root, 'december')
  assert.deepEqual(
    result.unreadable.map((u) => [u.kind, u.name, u.error]),
    [['character', 'Ana', 'ENOENT']]
  )
  assert.deepEqual(names(result), [['Another Fic', ['Ana']]])
})

test('searches lines, timeline events and note pages', () => {
  const ctx = setup()
  const { db, root, hockey, other } = ctx
  createLine(db, hockey, { line: 'You owe me a bagel.', speaker: 'Marie', type: 'banter' })
  createLine(db, hockey, { line: 'Skate faster.', speaker: 'Coach', notes: 'Callback to the bagel bet' })
  createTimelineEvent(db, hockey, { event: 'Bagel bet', date: 'September' })
  createTimelineEvent(db, other, { event: 'First snow', date: 'December 3', notes: 'cold open' })
  const page = createNotePage(db, root, hockey, 'Running jokes')
  fs.writeFileSync(path.join(root, 'Hockey AU', 'notes', 'Running jokes.md'), '# Jokes\n\nThe bagel thing.\n')

  const result = search(db, root, 'bagel')
  assert.deepEqual(names(result, 'notes'), [
    ['Hockey AU', ['You owe me a bagel.', 'Skate faster.', 'Bagel bet', 'Running jokes']]
  ])
  const [owe, skate, bet, jokes] = result.works.find((w) => w.title === 'Hockey AU').notes
  assert.deepEqual([owe.kind, bet.kind, jokes.kind], ['line', 'timeline', 'notePage'])
  assert.deepEqual(owe.matches, [])
  assert.deepEqual(skate.matches, [{ label: 'Notes', value: 'Callback to the bagel bet' }])
  assert.deepEqual(jokes, { kind: 'notePage', id: page, title: 'Running jokes', matches: [{ label: 'Text', value: 'The bagel thing.' }] })

  assert.deepEqual(names(search(db, root, 'coach'), 'notes'), [['Hockey AU', ['Skate faster.']]])
  assert.deepEqual(
    search(db, root, 'december').works.find((w) => w.title === 'Another Fic').notes[0].matches,
    [{ label: 'Date', value: 'December 3' }]
  )
})

test('searches chapters, scenes, beats, edit notes and prose by paragraph', () => {
  const ctx = setup()
  const { db, root } = ctx
  const { chapter, scene } = withChapter(
    ctx,
    '﻿Marie skates in late.\r\n\r\nShe has a bagel.\r\nStill warm.\r\n\r\nNo bagel for Laura.\r\n'
  )
  updateChapter(db, chapter, { notes: 'Ends on the bagel joke' })
  updateScene(db, scene, { pov: 'Marie', notes: 'Set up the bet' })
  createBeat(db, scene, { kind: 'bagel', content: 'Marie hands it over' })
  createEditNote(db, scene, { paragraph: 2, kind: 'tone', note: 'Bagel line is flat' })

  const hockey = search(db, root, 'BAGEL').works.find((w) => w.title === 'Hockey AU')
  assert.deepEqual(hockey.chapters, [
    {
      kind: 'chapter',
      id: chapter,
      title: 'Training Camp',
      context: 'Chapter 1',
      matches: [{ label: 'Notes', value: 'Ends on the bagel joke' }]
    },
    {
      kind: 'scene',
      id: scene,
      chapterId: chapter,
      title: 'Morning Skate',
      context: 'Chapter 1: Training Camp',
      matches: [
        { label: 'Beat 1: bagel', value: 'Marie hands it over' },
        { label: 'Edit note ¶2: tone', value: 'Bagel line is flat' },
        { label: 'Prose ¶2', value: 'She has a bagel.' },
        { label: 'Prose ¶3', value: 'No bagel for Laura.' }
      ],
      moreProse: 0
    }
  ])

  const byPov = search(db, root, 'marie').works.find((w) => w.title === 'Hockey AU').chapters
  assert.deepEqual(byPov.map((r) => r.title), ['Morning Skate'])
  assert.deepEqual(byPov[0].matches.map((m) => m.label), ['POV', 'Beat 1: bagel', 'Prose ¶1'])
  assert.deepEqual(names(search(db, root, 'training'), 'chapters'), [['Hockey AU', ['Training Camp']]])
  assert.deepEqual(names(search(db, root, 'skate'), 'chapters'), [['Hockey AU', ['Morning Skate']]])
})

test('a scene shows its first three matching paragraphs and counts the rest', () => {
  const ctx = setup()
  const prose = Array.from({ length: 5 }, (_, i) => `Puck number ${i + 1}.`).join('\n\n')
  withChapter(ctx, prose)
  const [scene] = search(ctx.db, ctx.root, 'puck').works[0].chapters
  assert.deepEqual(scene.matches.map((m) => m.label), ['Prose ¶1', 'Prose ¶2', 'Prose ¶3'])
  assert.equal(scene.moreProse, 2)
})

test('an unreadable scene or note page is reported, and the rest still searched', () => {
  const ctx = setup()
  const { db, root, hockey } = ctx
  const { scenePath } = withChapter(ctx, 'bagel')
  createNotePage(db, root, hockey, 'Gone')
  fs.rmSync(scenePath)
  fs.rmSync(path.join(root, 'Hockey AU', 'notes', 'Gone.md'))
  const result = search(db, root, 'skate')
  assert.deepEqual(
    result.unreadable.map((u) => [u.kind, u.name, u.error]),
    [
      ['notePage', 'Gone', 'ENOENT'],
      ['scene', 'Morning Skate', 'ENOENT']
    ]
  )
  assert.deepEqual(names(result, 'chapters'), [['Hockey AU', ['Morning Skate']]])
})

test('search reads and writes nothing it shouldn’t', () => {
  const ctx = setup()
  const { db, root, notes } = ctx
  const { scenePath } = withChapter(ctx, 'A bagel.\r\n')
  const before = [fs.readFileSync(notes('Hockey AU', 'Laura Stacey')), fs.readFileSync(scenePath)]
  search(db, root, 'bagel')
  assert.deepEqual([fs.readFileSync(notes('Hockey AU', 'Laura Stacey')), fs.readFileSync(scenePath)], before)
  assert.throws(() => search(db, root, 5), /must be text/)
})

test('a hidden work is not searched', () => {
  const ctx = setup()
  const { db, root, hockey } = ctx
  withChapter(ctx, 'a')
  createLine(db, hockey, { line: 'a line' })
  updateWork(db, hockey, { hidden: true })
  assert.deepEqual(
    search(db, root, 'a').works.map((w) => w.title),
    ['Another Fic']
  )
  updateWork(db, hockey, { hidden: false })
  assert.equal(search(db, root, 'marie').works.length, 1)
})
