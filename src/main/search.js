import fs from 'node:fs'
import { characterPath } from './paths.js'

// Searching every work's characters (spec: Search). No Electron imports,
// so this is tested with plain `node --test`.
//
// A character matches when the search text appears, ignoring case, in
// their name, age, birthday, any field's label or value, or their notes
// file. Notes files are read here, at search time, as wordcounts are:
// nothing from them is copied into the database, since an index of their
// text would be a field in both stores. Reads only.

const SNIPPET = 140

// The line of `text` holding the first match, cut to about SNIPPET
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

const contains = (value, needle) => value.toLowerCase().includes(needle)

// Returns { query, works: [{ id, title, characters: [{ id, name, matches }] }],
// unreadable: [{ characterId, name, filename, error }] }. Works and
// characters are in the sidebar's order. Each match is
// { where: 'name' | 'age' | 'birthday' | 'field' | 'notes', label, value }.
// A notes file that can't be read is listed in unreadable rather than
// silently left out. A blank query finds nothing.
export function searchCharacters(db, libraryRoot, query) {
  if (typeof query !== 'string') throw new Error('Search text must be text')
  const trimmed = query.trim()
  const result = { query: trimmed, works: [], unreadable: [] }
  if (trimmed === '') return result
  const needle = trimmed.toLowerCase()

  const characters = db
    .prepare(
      `SELECT c.id, c.name, c.age, c.birthday, c.filename, w.id AS workId, w.title AS workTitle, w.folder AS workFolder
       FROM characters c JOIN works w ON w.id = c.work_id
       ORDER BY w.title COLLATE NOCASE, w.id, c.name COLLATE NOCASE, c.id`
    )
    .all()
  const fields = Map.groupBy(
    db.prepare('SELECT character_id AS characterId, label, value FROM character_fields ORDER BY position').all(),
    (f) => f.characterId
  )

  const byWork = new Map()
  for (const c of characters) {
    const matches = []
    if (contains(c.name, needle)) matches.push({ where: 'name', label: 'Name', value: c.name })
    if (contains(c.age, needle)) matches.push({ where: 'age', label: 'Age', value: c.age })
    if (contains(c.birthday, needle)) matches.push({ where: 'birthday', label: 'Birthday', value: c.birthday })
    for (const f of fields.get(c.id) ?? []) {
      if (contains(f.label, needle) || contains(f.value, needle)) {
        matches.push({ where: 'field', label: f.label, value: f.value })
      }
    }

    let text = null
    try {
      text = fs.readFileSync(characterPath(libraryRoot, c.workFolder, c.filename), 'utf8')
    } catch (e) {
      result.unreadable.push({ characterId: c.id, name: c.name, filename: c.filename, error: e.code ?? e.message })
    }
    if (text !== null) {
      const at = text.toLowerCase().indexOf(needle)
      if (at !== -1) matches.push({ where: 'notes', label: 'Notes', value: snippet(text, at, needle.length) })
    }

    if (matches.length === 0) continue
    if (!byWork.has(c.workId)) byWork.set(c.workId, { id: c.workId, title: c.workTitle, characters: [] })
    byWork.get(c.workId).characters.push({ id: c.id, name: c.name, matches })
  }
  result.works = [...byWork.values()]
  return result
}
