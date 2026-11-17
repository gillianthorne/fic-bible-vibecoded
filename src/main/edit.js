// Writes to the structure tables. No Electron imports, so these are tested
// with plain `node --test`.
//
// Every function validates its input here, in the main process, whatever
// the form in the renderer already checked. Nothing in this file touches a
// file on disk: edits change database rows only, and folder and filename
// can't be edited at all.
//
// Updates take a patch: only the keys present are validated and changed.
// An unknown key is an error rather than being ignored, so a typo in the
// renderer can't silently drop an edit.

export const BEAT_STATUSES = ['planned', 'in draft', 'cut']
export const SCENE_STATUSES = ['outlined', 'drafting', 'drafted', 'revised']
export const CHAPTER_STATUSES = ['drafting', 'ready to post', 'posted']
export const EDIT_NOTE_STATUSES = ['open', 'fixed', 'ignored', 'cut']

// --- validation -----------------------------------------------------------

export function requireId(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer, got ${JSON.stringify(value)}`)
  }
  return value
}

// One-line text: trimmed, and required unless allowBlank.
export function line(value, label, { allowBlank = false } = {}) {
  if (typeof value !== 'string') throw new Error(`${label} must be text`)
  const trimmed = value.trim()
  if (!allowBlank && trimmed === '') throw new Error(`${label} can’t be blank`)
  return trimmed
}

// Multi-line text (beat content): kept as written, but not blank.
export function text(value, label) {
  if (typeof value !== 'string') throw new Error(`${label} must be text`)
  if (value.trim() === '') throw new Error(`${label} can’t be blank`)
  return value
}

export function oneOf(value, allowed, label) {
  if (!allowed.includes(value)) throw new Error(`${label} must be one of: ${allowed.join(', ')}`)
  return value
}

function positiveInt(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a whole number, 1 or more`)
  return value
}

export const nullable = (check) => (value, label) => (value === null ? null : check(value, label))

// Turns a patch into [[column, value], ...] using a map of
// key -> [column, validator]. Unknown keys and empty patches are errors.
export function columns(patch, fields, what) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error(`${what} changes must be an object`)
  }
  const keys = Object.keys(patch)
  if (keys.length === 0) throw new Error(`No ${what} changes given`)
  return keys.map((key) => {
    const field = fields[key]
    if (!field) throw new Error(`${what} has no editable field “${key}”`)
    const [column, check, label] = field
    return [column, check(patch[key], label)]
  })
}

export function update(db, table, id, cols) {
  const sets = cols.map(([column]) => `${column} = ?`).join(', ')
  db.prepare(`UPDATE ${table} SET ${sets} WHERE id = ?`).run(...cols.map(([, v]) => v), id)
}

export function mustExist(db, table, id, what) {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(requireId(id, `${what} id`))
  if (!row) throw new Error(`${what} ${id} not found`)
  return row
}

// --- beats ----------------------------------------------------------------

const BEAT_FIELDS = {
  kind: ['kind', line, 'Kind'],
  content: ['content', text, 'Beat'],
  status: ['status', (v, l) => oneOf(v, BEAT_STATUSES, l), 'Status'],
  paragraphRef: ['paragraph_ref', nullable(positiveInt), 'Paragraph']
}

// Adds a beat at the end of the scene. Returns the new beat's id.
export function createBeat(db, sceneId, fields) {
  mustExist(db, 'scenes', sceneId, 'Scene')
  const values = Object.fromEntries(columns(fields, BEAT_FIELDS, 'Beat'))
  for (const required of ['kind', 'content']) {
    if (!(required in values)) throw new Error(`A new beat needs a ${required}`)
  }
  return db.transaction(() => {
    const position = db.prepare('SELECT coalesce(max(position), 0) + 1 FROM beats WHERE scene_id = ?').pluck().get(sceneId)
    const info = db
      .prepare(
        `INSERT INTO beats (scene_id, position, kind, content, status, paragraph_ref)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(sceneId, position, values.kind, values.content, values.status ?? 'planned', values.paragraph_ref ?? null)
    return Number(info.lastInsertRowid)
  })()
}

export function updateBeat(db, beatId, patch) {
  mustExist(db, 'beats', beatId, 'Beat')
  update(db, 'beats', beatId, columns(patch, BEAT_FIELDS, 'Beat'))
}

// Swaps a row with its neighbour in a positioned list (beats in a scene,
// fields on a character). Moving the first up or the last down does
// nothing. Positions are UNIQUE per parent, so the row is parked past the
// end while its neighbour takes its place.
export function moveInList(db, table, parent, row, direction) {
  oneOf(direction, ['up', 'down'], 'Direction')
  db.transaction(() => {
    const neighbour = db
      .prepare(
        direction === 'up'
          ? `SELECT id, position FROM ${table} WHERE ${parent} = ? AND position < ? ORDER BY position DESC LIMIT 1`
          : `SELECT id, position FROM ${table} WHERE ${parent} = ? AND position > ? ORDER BY position LIMIT 1`
      )
      .get(row[parent], row.position)
    if (!neighbour) return
    const park = db.prepare(`SELECT max(position) + 1 FROM ${table} WHERE ${parent} = ?`).pluck().get(row[parent])
    const setPosition = db.prepare(`UPDATE ${table} SET position = ? WHERE id = ?`)
    setPosition.run(park, row.id)
    setPosition.run(row.position, neighbour.id)
    setPosition.run(neighbour.position, row.id)
  })()
}

// Deletes a row from a positioned list and closes the gap it leaves.
export function deleteFromList(db, table, parent, row) {
  db.transaction(() => {
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(row.id)
    // One row at a time, lowest first, so no step collides with UNIQUE.
    const later = db
      .prepare(`SELECT id FROM ${table} WHERE ${parent} = ? AND position > ? ORDER BY position`)
      .pluck()
      .all(row[parent], row.position)
    const shift = db.prepare(`UPDATE ${table} SET position = position - 1 WHERE id = ?`)
    for (const id of later) shift.run(id)
  })()
}

export function moveBeat(db, beatId, direction) {
  moveInList(db, 'beats', 'scene_id', mustExist(db, 'beats', beatId, 'Beat'), direction)
}

export function deleteBeat(db, beatId) {
  deleteFromList(db, 'beats', 'scene_id', mustExist(db, 'beats', beatId, 'Beat'))
}

// --- characters -------------------------------------------------------------

// The filename isn't editable: renaming a character leaves their notes
// file's name as it was (spec: File handling).
const CHARACTER_FIELDS = {
  name: ['name', line, 'Name'],
  age: ['age', (v, l) => line(v, l, { allowBlank: true }), 'Age'],
  birthday: ['birthday', (v, l) => line(v, l, { allowBlank: true }), 'Birthday']
}

export function updateCharacter(db, characterId, patch) {
  mustExist(db, 'characters', characterId, 'Character')
  update(db, 'characters', characterId, columns(patch, CHARACTER_FIELDS, 'Character'))
}

// Deletes the character's row and fields. Their notes file stays on disk.
export function deleteCharacter(db, characterId) {
  mustExist(db, 'characters', characterId, 'Character')
  db.prepare('DELETE FROM characters WHERE id = ?').run(characterId)
}

// A field's value may run to several lines and may be blank. It's
// trimmed, not otherwise changed.
function fieldValue(value, label) {
  if (typeof value !== 'string') throw new Error(`${label} must be text`)
  return value.trim()
}

const CHARACTER_FIELD_FIELDS = {
  label: ['label', line, 'Label'],
  value: ['value', fieldValue, 'Value']
}

// Adds a field at the end of the character's list. Returns its id.
export function createCharacterField(db, characterId, fields) {
  mustExist(db, 'characters', characterId, 'Character')
  const values = Object.fromEntries(columns(fields, CHARACTER_FIELD_FIELDS, 'Field'))
  if (!('label' in values)) throw new Error('A new field needs a label')
  return db.transaction(() => {
    const position = db
      .prepare('SELECT coalesce(max(position), 0) + 1 FROM character_fields WHERE character_id = ?')
      .pluck()
      .get(characterId)
    const info = db
      .prepare('INSERT INTO character_fields (character_id, position, label, value) VALUES (?, ?, ?, ?)')
      .run(characterId, position, values.label, values.value ?? '')
    return Number(info.lastInsertRowid)
  })()
}

export function updateCharacterField(db, fieldId, patch) {
  mustExist(db, 'character_fields', fieldId, 'Field')
  update(db, 'character_fields', fieldId, columns(patch, CHARACTER_FIELD_FIELDS, 'Field'))
}

export function moveCharacterField(db, fieldId, direction) {
  const field = mustExist(db, 'character_fields', fieldId, 'Field')
  moveInList(db, 'character_fields', 'character_id', field, direction)
}

export function deleteCharacterField(db, fieldId) {
  deleteFromList(db, 'character_fields', 'character_id', mustExist(db, 'character_fields', fieldId, 'Field'))
}

// --- edit notes -----------------------------------------------------------

// No position: notes are listed by paragraph, then in the order added, so
// there is nothing to reorder or renumber.
const EDIT_NOTE_FIELDS = {
  paragraph: ['paragraph', positiveInt, 'Paragraph'],
  kind: ['kind', (v, l) => line(v, l, { allowBlank: true }), 'Kind'],
  note: ['note', text, 'Note'],
  status: ['status', (v, l) => oneOf(v, EDIT_NOTE_STATUSES, l), 'Status']
}

// Adds an edit note to a scene. Returns the new note's id.
export function createEditNote(db, sceneId, fields) {
  mustExist(db, 'scenes', sceneId, 'Scene')
  const values = Object.fromEntries(columns(fields, EDIT_NOTE_FIELDS, 'Edit note'))
  for (const required of ['paragraph', 'note']) {
    if (!(required in values)) throw new Error(`A new edit note needs a ${required}`)
  }
  const info = db
    .prepare('INSERT INTO edit_notes (scene_id, paragraph, kind, note, status) VALUES (?, ?, ?, ?, ?)')
    .run(sceneId, values.paragraph, values.kind ?? '', values.note, values.status ?? 'open')
  return Number(info.lastInsertRowid)
}

export function updateEditNote(db, noteId, patch) {
  mustExist(db, 'edit_notes', noteId, 'Edit note')
  update(db, 'edit_notes', noteId, columns(patch, EDIT_NOTE_FIELDS, 'Edit note'))
}

export function deleteEditNote(db, noteId) {
  mustExist(db, 'edit_notes', noteId, 'Edit note')
  db.prepare('DELETE FROM edit_notes WHERE id = ?').run(noteId)
}

// --- scenes, chapters, works ------------------------------------------------

// ISO date (YYYY-MM-DD) that is a real calendar date.
function isoDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be a date written YYYY-MM-DD`)
  }
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} ${value} is not a real date`)
  }
  return value
}

// A blank link is stored as null, the same as "not posted".
function optionalLine(value, label) {
  if (value === null) return null
  const trimmed = line(value, label, { allowBlank: true })
  return trimmed === '' ? null : trimmed
}

// Notes: multi-line, kept as written. Blank is stored as null, "no notes".
export function optionalText(value, label) {
  if (value === null) return null
  if (typeof value !== 'string') throw new Error(`${label} must be text`)
  return value.trim() === '' ? null : value
}

const SCENE_FIELDS = {
  title: ['title', line, 'Title'],
  pov: ['pov', (v, l) => line(v, l, { allowBlank: true }), 'POV'],
  status: ['status', (v, l) => oneOf(v, SCENE_STATUSES, l), 'Status'],
  position: ['position', positiveInt, 'Position'],
  notes: ['notes', optionalText, 'Notes']
}

const CHAPTER_FIELDS = {
  number: ['number', positiveInt, 'Chapter number'],
  title: ['title', line, 'Title'],
  status: ['status', (v, l) => oneOf(v, CHAPTER_STATUSES, l), 'Status'],
  postedDate: ['posted_date', nullable(isoDate), 'Posted date'],
  postedUrl: ['posted_url', optionalLine, 'AO3 link'],
  notes: ['notes', optionalText, 'Notes']
}

const WORK_FIELDS = {
  title: ['title', line, 'Title'],
  url: ['url', optionalLine, 'Work link'],
  notes: ['notes', optionalText, 'Notes']
}

// Positions and numbers are UNIQUE among siblings. A taken one is refused
// with a message naming who has it, rather than swapping silently.
function refuseTaken(db, sql, args, message) {
  const holder = db.prepare(sql).get(...args)
  if (holder) throw new Error(message(holder))
}

export function updateScene(db, sceneId, patch) {
  const scene = mustExist(db, 'scenes', sceneId, 'Scene')
  const cols = columns(patch, SCENE_FIELDS, 'Scene')
  const position = cols.find(([column]) => column === 'position')?.[1]
  if (position !== undefined) {
    refuseTaken(
      db,
      'SELECT title FROM scenes WHERE chapter_id = ? AND position = ? AND id <> ?',
      [scene.chapter_id, position, scene.id],
      (other) => `Position ${position} is already used by the scene “${other.title}”`
    )
  }
  update(db, 'scenes', scene.id, cols)
}

export function updateChapter(db, chapterId, patch) {
  const chapter = mustExist(db, 'chapters', chapterId, 'Chapter')
  const cols = columns(patch, CHAPTER_FIELDS, 'Chapter')
  const number = cols.find(([column]) => column === 'number')?.[1]
  if (number !== undefined) {
    refuseTaken(
      db,
      'SELECT title FROM chapters WHERE work_id = ? AND number = ? AND id <> ?',
      [chapter.work_id, number, chapter.id],
      (other) => `Chapter ${number} already exists in this work: “${other.title}”`
    )
  }
  update(db, 'chapters', chapter.id, cols)
}

// fandom and ship are names, not ids: the form sends what was typed, and
// the row is found (case-insensitively) or created here. Blank or null
// means none. A ship belongs to a fandom, so:
// - a ship needs the work to have a fandom, and is looked up in that one
// - changing the fandom without giving a ship clears the ship
// - clearing the fandom clears the ship
// Afterwards, fandoms and ships no work uses are deleted, so the
// suggestions don't fill up with old typos.
export function updateWork(db, workId, patch) {
  const work = mustExist(db, 'works', workId, 'Work')
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('Work changes must be an object')
  }
  const { fandom, ship, ...rest } = patch
  const hasFandom = 'fandom' in patch
  const hasShip = 'ship' in patch
  // columns() refuses an empty patch, so only ask it when there's more than
  // fandom and ship, or nothing at all.
  const onlyNames = Object.keys(rest).length === 0 && (hasFandom || hasShip)
  const cols = onlyNames ? [] : columns(rest, WORK_FIELDS, 'Work')
  const fandomName = hasFandom ? optionalLine(fandom, 'Fandom') : undefined
  const shipName = hasShip ? optionalLine(ship, 'Ship') : undefined

  db.transaction(() => {
    let fandomId = work.fandom_id
    if (hasFandom) fandomId = fandomName === null ? null : findOrCreate(db, 'fandoms', {}, fandomName)
    let shipId = work.ship_id
    if (hasShip) {
      if (shipName !== null && fandomId === null) throw new Error('A ship needs a fandom: set the fandom first')
      shipId = shipName === null ? null : findOrCreate(db, 'ships', { fandom_id: fandomId }, shipName)
    } else if (fandomId !== work.fandom_id) {
      shipId = null
    }
    update(db, 'works', work.id, [...cols, ['fandom_id', fandomId], ['ship_id', shipId]])
    pruneUnused(db)
  })()
}

// The id of the row in `table` with this name (and these other columns),
// matched case-insensitively; a new row if there's none.
function findOrCreate(db, table, scope, name) {
  const keys = Object.keys(scope)
  const where = keys.map((k) => ` AND ${k} = ?`).join('')
  const found = db
    .prepare(`SELECT id FROM ${table} WHERE name = ? COLLATE NOCASE${where}`)
    .pluck()
    .get(name, ...Object.values(scope))
  if (found !== undefined) return found
  const info = db
    .prepare(`INSERT INTO ${table} (${[...keys, 'name'].join(', ')}) VALUES (${[...keys, 'name'].map(() => '?').join(', ')})`)
    .run(...Object.values(scope), name)
  return Number(info.lastInsertRowid)
}

function pruneUnused(db) {
  db.prepare('DELETE FROM ships WHERE id NOT IN (SELECT ship_id FROM works WHERE ship_id IS NOT NULL)').run()
  db.prepare('DELETE FROM fandoms WHERE id NOT IN (SELECT fandom_id FROM works WHERE fandom_id IS NOT NULL)').run()
}
