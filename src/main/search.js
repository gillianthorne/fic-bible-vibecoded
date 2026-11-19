import fs from 'node:fs'
import { characterPath, notePagePath, scenePath } from './paths.js'
import { splitParagraphs } from './prose.js'

// Searching every work's characters, notes and chapters (spec: Search).
// No Electron imports, so this is tested with plain `node --test`.
//
// Text matches ignore case. Files (character notes, note pages, scene
// prose) are read here, at search time, as wordcounts are: nothing from
// them is copied into the database, since an index of their text would be
// a field in both stores. Reads only.

const SNIPPET = 140
// A scene lists this many matching paragraphs, then a count of the rest.
const PROSE_SHOWN = 3

// The line of `text` holding the match at `at`, cut to about SNIPPET
// characters around it.
function snippet(text, at, length) {
  const start = text.lastIndexOf('\n', at - 1) + 1
  const endLine = text.indexOf('\n', at)
  const end = endLine === -1 ? text.length : endLine
  let from = start
  let to = end
  if (to - from > SNIPPET) {
    from = Math.max(start, at - Math.floor((SNIPPET - length) / 2))
    to = Math.min(end, from + SNIPPET)
  }
  return `${from > start ? '…' : ''}${text.slice(from, to).trim()}${to < end ? '…' : ''}`
}

const contains = (value, needle) => value != null && value.toLowerCase().includes(needle)

// The line around the first match in `text`, or null.
function find(text, needle) {
  if (text == null) return null
  const at = text.toLowerCase().indexOf(needle)
  return at === -1 ? null : snippet(text, at, needle.length)
}

// A file's text, or null after listing it in unreadable.
function read(file, unreadable, what) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch (e) {
    unreadable.push({ ...what, error: e.code ?? e.message })
    return null
  }
}

// Returns { query, works, unreadable }.
//
// works: [{ id, title, characters, notes, chapters }], in the sidebar's
// order, only those with a result. Each result is { kind, id, title,
// matches }, plus chapterId and context for a scene and context for a
// chapter; kind is 'character', 'line', 'timeline', 'notePage', 'chapter'
// or 'scene'. title is what the result is called (a character's name, a
// line's text); whether it matched is for the screen to highlight. matches
// are what else matched, each { label, value }. A scene's prose matches
// are its first PROSE_SHOWN paragraphs, and moreProse counts the rest.
//
// unreadable: [{ kind, name, filename, error }] for files that couldn't
// be read, so they're reported rather than silently left out. A blank
// query finds nothing. Hidden works are not searched.
export function search(db, libraryRoot, query) {
  if (typeof query !== 'string') throw new Error('Search text must be text')
  const trimmed = query.trim()
  const result = { query: trimmed, works: [], unreadable: [] }
  if (trimmed === '') return result
  const needle = trimmed.toLowerCase()
  const hit = (value) => contains(value, needle)
  const { unreadable } = result

  const works = db
    .prepare('SELECT id, title, folder FROM works WHERE hidden = 0 ORDER BY title COLLATE NOCASE, id')
    .all()
    .map((w) => ({ ...w, characters: [], notes: [], chapters: [] }))
  const byId = new Map(works.map((w) => [w.id, w]))
  const workOf = (id) => byId.get(id)

  // Characters
  const fields = Map.groupBy(
    db.prepare('SELECT character_id AS characterId, label, value FROM character_fields ORDER BY position').all(),
    (f) => f.characterId
  )
  const characters = db
    .prepare('SELECT id, work_id AS workId, name, age, birthday, filename FROM characters ORDER BY name COLLATE NOCASE, id')
    .all()
  for (const c of characters) {
    const work = workOf(c.workId)
    if (!work) continue
    const matches = []
    if (hit(c.age)) matches.push({ label: 'Age', value: c.age })
    if (hit(c.birthday)) matches.push({ label: 'Birthday', value: c.birthday })
    for (const f of fields.get(c.id) ?? []) {
      if (hit(f.label) || hit(f.value)) matches.push({ label: f.label, value: f.value })
    }
    const text = read(characterPath(libraryRoot, work.folder, c.filename), unreadable, {
      kind: 'character',
      name: c.name,
      filename: c.filename
    })
    const notes = find(text, needle)
    if (notes !== null) matches.push({ label: 'Notes', value: notes })
    if (hit(c.name) || matches.length > 0) {
      work.characters.push({ kind: 'character', id: c.id, title: c.name, matches })
    }
  }

  // Notes: lines, then the timeline, then note pages, as the sidebar's
  // Notes group lists them.
  const lines = db.prepare('SELECT id, work_id AS workId, line, type, speaker, notes FROM lines ORDER BY id').all()
  for (const l of lines) {
    const work = workOf(l.workId)
    if (!work) continue
    const matches = []
    if (hit(l.type)) matches.push({ label: 'Type', value: l.type })
    if (hit(l.speaker)) matches.push({ label: 'Speaker', value: l.speaker })
    if (hit(l.notes)) matches.push({ label: 'Notes', value: find(l.notes, needle) })
    if (hit(l.line) || matches.length > 0) work.notes.push({ kind: 'line', id: l.id, title: l.line, matches })
  }

  const events = db
    .prepare('SELECT id, work_id AS workId, event, date, notes FROM timeline_events ORDER BY position')
    .all()
  for (const e of events) {
    const work = workOf(e.workId)
    if (!work) continue
    const matches = []
    if (hit(e.date)) matches.push({ label: 'Date', value: e.date })
    if (hit(e.notes)) matches.push({ label: 'Notes', value: find(e.notes, needle) })
    if (hit(e.event) || matches.length > 0) work.notes.push({ kind: 'timeline', id: e.id, title: e.event, matches })
  }

  const pages = db.prepare('SELECT id, work_id AS workId, name, filename FROM note_pages ORDER BY position').all()
  for (const p of pages) {
    const work = workOf(p.workId)
    if (!work) continue
    const matches = []
    const text = read(notePagePath(libraryRoot, work.folder, p.filename), unreadable, {
      kind: 'notePage',
      name: p.name,
      filename: p.filename
    })
    const found = find(text, needle)
    if (found !== null) matches.push({ label: 'Text', value: found })
    if (hit(p.name) || matches.length > 0) work.notes.push({ kind: 'notePage', id: p.id, title: p.name, matches })
  }

  // Chapters: each chapter, then its scenes, in reading order.
  const beats = Map.groupBy(
    db.prepare('SELECT scene_id AS sceneId, position, kind, content FROM beats ORDER BY position').all(),
    (b) => b.sceneId
  )
  const editNotes = Map.groupBy(
    db.prepare('SELECT scene_id AS sceneId, paragraph, kind, note FROM edit_notes ORDER BY paragraph, id').all(),
    (n) => n.sceneId
  )
  const scenes = Map.groupBy(
    db
      .prepare('SELECT id, chapter_id AS chapterId, title, filename, pov, notes FROM scenes ORDER BY position')
      .all(),
    (s) => s.chapterId
  )
  const chapters = db
    .prepare('SELECT id, work_id AS workId, number, title, folder, notes FROM chapters ORDER BY number')
    .all()
  for (const c of chapters) {
    const work = workOf(c.workId)
    if (!work) continue
    const context = `Chapter ${c.number}`
    const chapterMatches = []
    if (hit(c.notes)) chapterMatches.push({ label: 'Notes', value: find(c.notes, needle) })
    if (hit(c.title) || chapterMatches.length > 0) {
      work.chapters.push({ kind: 'chapter', id: c.id, title: c.title, context, matches: chapterMatches })
    }

    for (const s of scenes.get(c.id) ?? []) {
      const matches = []
      if (hit(s.pov)) matches.push({ label: 'POV', value: s.pov })
      if (hit(s.notes)) matches.push({ label: 'Notes', value: find(s.notes, needle) })
      for (const b of beats.get(s.id) ?? []) {
        if (hit(b.kind) || hit(b.content)) {
          matches.push({ label: b.kind ? `Beat ${b.position}: ${b.kind}` : `Beat ${b.position}`, value: b.content })
        }
      }
      for (const n of editNotes.get(s.id) ?? []) {
        if (hit(n.kind) || hit(n.note)) {
          matches.push({ label: `Edit note ¶${n.paragraph}${n.kind ? `: ${n.kind}` : ''}`, value: n.note })
        }
      }
      // Paragraphs split as the prose viewer splits them, so ¶N here is
      // the viewer's paragraph N.
      const text = read(scenePath(libraryRoot, work.folder, c.folder, s.filename), unreadable, {
        kind: 'scene',
        name: s.title,
        filename: s.filename
      })
      let shown = 0
      let moreProse = 0
      if (text !== null) {
        splitParagraphs(text).forEach((paragraph, i) => {
          const found = find(paragraph, needle)
          if (found === null) return
          if (shown < PROSE_SHOWN) {
            matches.push({ label: `Prose ¶${i + 1}`, value: found })
            shown++
          } else moreProse++
        })
      }
      if (hit(s.title) || matches.length > 0) {
        work.chapters.push({
          kind: 'scene',
          id: s.id,
          chapterId: c.id,
          title: s.title,
          context: `${context}: ${c.title}`,
          matches,
          moreProse
        })
      }
    }
  }

  result.works = works
    .filter((w) => w.characters.length + w.notes.length + w.chapters.length > 0)
    .map(({ id, title, characters, notes, chapters }) => ({ id, title, characters, notes, chapters }))
  return result
}
