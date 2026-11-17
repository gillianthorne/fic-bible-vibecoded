import {
  columns,
  deleteFromList,
  line,
  moveInList,
  mustExist,
  nullable,
  oneOf,
  optionalText,
  requireId,
  text,
  update
} from './edit.js'

// A work's notes (docs/spec.md, screens 9-11): its line dictionary, its
// timeline, and the rows behind its note pages. No Electron imports, so
// these are tested with plain `node --test`. Nothing here touches a file:
// creating and saving a note page's file is in create.js and save.js.

export const LINE_STATUSES = ['planned', 'used', 'dropped']

const blankable = (v, l) => line(v, l, { allowBlank: true })
const id = (v, l) => requireId(v, l)

// --- the line dictionary -----------------------------------------------------

const LINE_FIELDS = {
  line: ['line', text, 'Line'],
  type: ['type', blankable, 'Type'],
  speaker: ['speaker', blankable, 'Speaker'],
  chapterId: ['chapter_id', nullable(id), 'Chapter'],
  sceneId: ['scene_id', nullable(id), 'Scene'],
  beatId: ['beat_id', nullable(id), 'Beat'],
  status: ['status', (v, l) => oneOf(v, LINE_STATUSES, l), 'Status'],
  notes: ['notes', optionalText, 'Notes']
}

// A line's chapter must be in its work, its scene in that chapter, and its
// beat in that scene; a scene needs a chapter and a beat needs a scene.
// Checked on the line as it will be after the change.
function checkPlace(db, workId, { chapter_id: chapterId, scene_id: sceneId, beat_id: beatId }) {
  if (sceneId !== null && chapterId === null) throw new Error('A scene needs a chapter: choose the chapter first')
  if (beatId !== null && sceneId === null) throw new Error('A beat needs a scene: choose the scene first')
  if (chapterId !== null) {
    const chapter = db.prepare('SELECT work_id FROM chapters WHERE id = ?').get(chapterId)
    if (!chapter) throw new Error(`Chapter ${chapterId} not found`)
    if (chapter.work_id !== workId) throw new Error('That chapter is in another work')
  }
  if (sceneId !== null) {
    const scene = db.prepare('SELECT chapter_id FROM scenes WHERE id = ?').get(sceneId)
    if (!scene) throw new Error(`Scene ${sceneId} not found`)
    if (scene.chapter_id !== chapterId) throw new Error('That scene isn’t in the chosen chapter')
  }
  if (beatId !== null) {
    const beat = db.prepare('SELECT scene_id FROM beats WHERE id = ?').get(beatId)
    if (!beat) throw new Error(`Beat ${beatId} not found`)
    if (beat.scene_id !== sceneId) throw new Error('That beat isn’t in the chosen scene')
  }
}

// Adds a line to a work's dictionary. Returns its id.
export function createLine(db, workId, fields) {
  mustExist(db, 'works', workId, 'Work')
  const values = Object.fromEntries(columns(fields, LINE_FIELDS, 'Line'))
  if (!('line' in values)) throw new Error('A new line needs its text')
  const row = { chapter_id: null, scene_id: null, beat_id: null, ...values }
  checkPlace(db, workId, row)
  const info = db
    .prepare(
      `INSERT INTO lines (work_id, line, type, speaker, chapter_id, scene_id, beat_id, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      workId,
      row.line,
      row.type ?? '',
      row.speaker ?? '',
      row.chapter_id,
      row.scene_id,
      row.beat_id,
      row.status ?? 'planned',
      row.notes ?? null
    )
  return Number(info.lastInsertRowid)
}

export function updateLine(db, lineId, patch) {
  const existing = mustExist(db, 'lines', lineId, 'Line')
  const cols = columns(patch, LINE_FIELDS, 'Line')
  checkPlace(db, existing.work_id, { ...existing, ...Object.fromEntries(cols) })
  update(db, 'lines', existing.id, cols)
}

export function deleteLine(db, lineId) {
  mustExist(db, 'lines', lineId, 'Line')
  db.prepare('DELETE FROM lines WHERE id = ?').run(lineId)
}

// Previously used values in one work, most used first, ties alphabetical.
function usage(db, column, workId) {
  return db
    .prepare(
      `SELECT ${column} AS value, count(*) AS count FROM lines
       WHERE work_id = ? AND ${column} <> ''
       GROUP BY ${column} ORDER BY count DESC, ${column}`
    )
    .all(workId)
}

// The line dictionary screen: the work, every line with what it points
// at, the work's chapters, scenes and beats to choose from, and this
// work's suggestions. Lines come grouped by type (types in name order,
// no type last), and within a type in chapter, then scene, then added
// order, with lines that have no chapter last. Returns null for an
// unknown work.
export function lineDictionary(db, workId) {
  const work = db.prepare('SELECT id, title FROM works WHERE id = ?').get(workId)
  if (!work) return null

  const lines = db
    .prepare(
      `SELECT l.id, l.line, l.type, l.speaker, l.status, l.notes,
              c.id AS chapterId, c.number AS chapterNumber, c.title AS chapterTitle,
              s.id AS sceneId, s.position AS scenePosition, s.title AS sceneTitle,
              b.id AS beatId, b.position AS beatPosition, b.kind AS beatKind, b.content AS beatContent
       FROM lines l
       LEFT JOIN chapters c ON c.id = l.chapter_id
       LEFT JOIN scenes s ON s.id = l.scene_id
       LEFT JOIN beats b ON b.id = l.beat_id
       WHERE l.work_id = ?
       ORDER BY l.type = '', l.type COLLATE NOCASE, l.type,
                c.number IS NULL, c.number, s.position IS NULL, s.position, l.id`
    )
    .all(workId)
    .map((r) => ({
      id: r.id,
      line: r.line,
      type: r.type,
      speaker: r.speaker,
      status: r.status,
      notes: r.notes,
      chapter: r.chapterId === null ? null : { id: r.chapterId, number: r.chapterNumber, title: r.chapterTitle },
      scene: r.sceneId === null ? null : { id: r.sceneId, position: r.scenePosition, title: r.sceneTitle },
      beat: r.beatId === null ? null : { id: r.beatId, position: r.beatPosition, kind: r.beatKind, content: r.beatContent }
    }))

  return { work, lines, chapters: workStructure(db, workId), suggestions: lineSuggestions(db, workId) }
}

// The work's chapters, each with its scenes and each scene's beats, for
// the pickers. Reads no files.
function workStructure(db, workId) {
  const chapters = db
    .prepare('SELECT id, number, title FROM chapters WHERE work_id = ? ORDER BY number')
    .all(workId)
    .map((c) => ({ ...c, scenes: [] }))
  const byChapter = new Map(chapters.map((c) => [c.id, c]))
  const scenes = db
    .prepare(
      `SELECT s.id, s.chapter_id AS chapterId, s.position, s.title FROM scenes s
       JOIN chapters c ON c.id = s.chapter_id WHERE c.work_id = ? ORDER BY s.position`
    )
    .all(workId)
  const byScene = new Map()
  for (const { chapterId, ...s } of scenes) {
    const scene = { ...s, beats: [] }
    byScene.set(s.id, scene)
    byChapter.get(chapterId).scenes.push(scene)
  }
  const beats = db
    .prepare(
      `SELECT b.id, b.scene_id AS sceneId, b.position, b.kind, b.content FROM beats b
       JOIN scenes s ON s.id = b.scene_id JOIN chapters c ON c.id = s.chapter_id
       WHERE c.work_id = ? ORDER BY b.position`
    )
    .all(workId)
  for (const { sceneId, ...b } of beats) byScene.get(sceneId).beats.push(b)
  return chapters
}

// Types and speakers used in this work. Speakers also offer the work's
// character names, whether or not they've spoken yet.
function lineSuggestions(db, workId) {
  const speakers = usage(db, 'speaker', workId)
  const used = new Set(speakers.map((s) => s.value))
  const characters = db
    .prepare('SELECT name FROM characters WHERE work_id = ? ORDER BY name COLLATE NOCASE')
    .pluck()
    .all(workId)
  for (const name of characters) if (!used.has(name)) speakers.push({ value: name })
  return { types: usage(db, 'type', workId), speakers }
}

// --- the timeline ------------------------------------------------------------

const TIMELINE_FIELDS = {
  event: ['event', text, 'Event'],
  date: ['date', blankable, 'Date'],
  chapterId: ['chapter_id', nullable(id), 'Chapter'],
  notes: ['notes', optionalText, 'Notes']
}

function checkChapter(db, workId, chapterId) {
  if (chapterId === null || chapterId === undefined) return
  const chapter = db.prepare('SELECT work_id FROM chapters WHERE id = ?').get(chapterId)
  if (!chapter) throw new Error(`Chapter ${chapterId} not found`)
  if (chapter.work_id !== workId) throw new Error('That chapter is in another work')
}

// Adds an event at the end of the work's timeline. Returns its id.
export function createTimelineEvent(db, workId, fields) {
  mustExist(db, 'works', workId, 'Work')
  const values = Object.fromEntries(columns(fields, TIMELINE_FIELDS, 'Event'))
  if (!('event' in values)) throw new Error('A new timeline entry needs an event')
  checkChapter(db, workId, values.chapter_id)
  return db.transaction(() => {
    const position = db
      .prepare('SELECT coalesce(max(position), 0) + 1 FROM timeline_events WHERE work_id = ?')
      .pluck()
      .get(workId)
    const info = db
      .prepare(
        'INSERT INTO timeline_events (work_id, position, event, date, chapter_id, notes) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(workId, position, values.event, values.date ?? '', values.chapter_id ?? null, values.notes ?? null)
    return Number(info.lastInsertRowid)
  })()
}

export function updateTimelineEvent(db, eventId, patch) {
  const existing = mustExist(db, 'timeline_events', eventId, 'Timeline entry')
  const cols = columns(patch, TIMELINE_FIELDS, 'Timeline entry')
  checkChapter(db, existing.work_id, Object.fromEntries(cols).chapter_id)
  update(db, 'timeline_events', existing.id, cols)
}

export function moveTimelineEvent(db, eventId, direction) {
  moveInList(db, 'timeline_events', 'work_id', mustExist(db, 'timeline_events', eventId, 'Timeline entry'), direction)
}

export function deleteTimelineEvent(db, eventId) {
  deleteFromList(db, 'timeline_events', 'work_id', mustExist(db, 'timeline_events', eventId, 'Timeline entry'))
}

// The timeline screen: the work, its events in order, and its chapters to
// choose from. Returns null for an unknown work.
export function timeline(db, workId) {
  const work = db.prepare('SELECT id, title FROM works WHERE id = ?').get(workId)
  if (!work) return null
  const events = db
    .prepare(
      `SELECT e.id, e.position, e.event, e.date, e.notes, c.id AS chapterId, c.number AS chapterNumber, c.title AS chapterTitle
       FROM timeline_events e LEFT JOIN chapters c ON c.id = e.chapter_id
       WHERE e.work_id = ? ORDER BY e.position`
    )
    .all(workId)
    .map(({ chapterId, chapterNumber, chapterTitle, ...e }) => ({
      ...e,
      chapter: chapterId === null ? null : { id: chapterId, number: chapterNumber, title: chapterTitle }
    }))
  const chapters = db.prepare('SELECT id, number, title FROM chapters WHERE work_id = ? ORDER BY number').all(workId)
  return { work, events, chapters }
}

// --- note pages (rows only) --------------------------------------------------

// The name is what's shown, and can change; the filename can't (spec:
// File handling).
export function renameNotePage(db, pageId, name) {
  mustExist(db, 'note_pages', pageId, 'Note page')
  update(db, 'note_pages', pageId, [['name', line(name, 'Name')]])
}

export function moveNotePage(db, pageId, direction) {
  moveInList(db, 'note_pages', 'work_id', mustExist(db, 'note_pages', pageId, 'Note page'), direction)
}

// Removes the page from the list. Its file stays on disk.
export function deleteNotePage(db, pageId) {
  deleteFromList(db, 'note_pages', 'work_id', mustExist(db, 'note_pages', pageId, 'Note page'))
}
