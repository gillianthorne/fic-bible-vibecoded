import fs from 'node:fs'
import { countProse, countWords, splitParagraphs } from './prose.js'
import { scenePath } from './paths.js'

// Read-only data access for the v1 screens. No Electron imports, so
// these run in tests and scripts too.
//
// Wordcounts are never in the database (spec: Derived values). A scene's
// count comes from reading its file; chapter and work totals are sums of
// those, done here in JS, not in SQL. A file that can't be read gives
// wordcount: null plus fileError, and totals report how many scenes they
// could not count rather than quietly undercounting.

function readSceneFile(libraryRoot, workFolder, chapterFolder, filename) {
  const file = scenePath(libraryRoot, workFolder, chapterFolder, filename)
  try {
    const { words, paragraphs } = countProse(fs.readFileSync(file, 'utf8'))
    return { path: file, wordcount: words, paragraphs, fileError: null }
  } catch (e) {
    return { path: file, wordcount: null, paragraphs: null, fileError: e.code ?? e.message }
  }
}

function total(items) {
  let wordcount = 0
  let uncounted = 0
  for (const item of items) {
    if (item.wordcount === null) uncounted++
    else wordcount += item.wordcount
  }
  return { wordcount, uncounted }
}

// Sidebar: works -> chapters -> scenes, with status. Reads no files.
// Works and chapters with no children are included, with empty arrays.
export function navigationTree(db) {
  const rows = db
    .prepare(
      `SELECT w.id AS workId, w.title AS workTitle,
              c.id AS chapterId, c.number, c.title AS chapterTitle, c.status AS chapterStatus,
              s.id AS sceneId, s.position, s.title AS sceneTitle, s.status AS sceneStatus
       FROM works w
       LEFT JOIN chapters c ON c.work_id = w.id
       LEFT JOIN scenes s ON s.chapter_id = c.id
       ORDER BY w.title COLLATE NOCASE, w.id, c.number, s.position`
    )
    .all()

  const works = []
  const workById = new Map()
  const chapterById = new Map()
  for (const r of rows) {
    let work = workById.get(r.workId)
    if (!work) {
      work = { id: r.workId, title: r.workTitle, chapters: [] }
      workById.set(r.workId, work)
      works.push(work)
    }
    if (r.chapterId === null) continue
    let chapter = chapterById.get(r.chapterId)
    if (!chapter) {
      chapter = { id: r.chapterId, number: r.number, title: r.chapterTitle, status: r.chapterStatus, scenes: [] }
      chapterById.set(r.chapterId, chapter)
      work.chapters.push(chapter)
    }
    if (r.sceneId === null) continue
    chapter.scenes.push({ id: r.sceneId, position: r.position, title: r.sceneTitle, status: r.sceneStatus })
  }
  return works
}

// Chapter overview table. Returns null for an unknown chapter.
export function chapterOverview(db, libraryRoot, chapterId) {
  const chapter = db
    .prepare(
      `SELECT c.id, c.number, c.title, c.status, c.folder, c.posted_date AS postedDate,
              c.posted_url AS postedUrl, c.notes, w.id AS workId, w.title AS workTitle, w.folder AS workFolder
       FROM chapters c JOIN works w ON w.id = c.work_id
       WHERE c.id = ?`
    )
    .get(chapterId)
  if (!chapter) return null

  // Beat counts are counts of rows, not wordcounts, so SQL does them.
  const rows = db
    .prepare(
      `SELECT s.id, s.position, s.title, s.pov, s.status, s.filename,
              count(b.id) AS total,
              count(CASE WHEN b.status = 'planned' THEN 1 END) AS planned,
              count(CASE WHEN b.status = 'in draft' THEN 1 END) AS inDraft,
              count(CASE WHEN b.status = 'cut' THEN 1 END) AS cut
       FROM scenes s LEFT JOIN beats b ON b.scene_id = s.id
       WHERE s.chapter_id = ?
       GROUP BY s.id
       ORDER BY s.position`
    )
    .all(chapterId)

  const scenes = rows.map(({ total: beatTotal, planned, inDraft, cut, filename, ...scene }) => {
    const file = readSceneFile(libraryRoot, chapter.workFolder, chapter.folder, filename)
    return {
      ...scene,
      wordcount: file.wordcount,
      fileError: file.fileError,
      beats: { total: beatTotal, planned, inDraft, cut }
    }
  })

  const { workId, workTitle, workFolder, ...rest } = chapter
  return { chapter: { ...rest, work: { id: workId, title: workTitle, folder: workFolder } }, scenes, ...total(scenes) }
}

// Scene detail: the scene's fields, its file-derived counts, and its beats
// in order. chapterSceneCount lets the screen say "scene 2 of 4". Returns
// null for an unknown scene.
export function sceneDetail(db, libraryRoot, sceneId) {
  const scene = db
    .prepare(
      `SELECT s.id, s.position, s.title, s.pov, s.status, s.filename, s.notes,
              (SELECT count(*) FROM scenes sib WHERE sib.chapter_id = s.chapter_id) AS chapterSceneCount,
              c.id AS chapterId, c.number AS chapterNumber, c.title AS chapterTitle, c.folder AS chapterFolder,
              w.id AS workId, w.title AS workTitle, w.folder AS workFolder
       FROM scenes s
       JOIN chapters c ON c.id = s.chapter_id
       JOIN works w ON w.id = c.work_id
       WHERE s.id = ?`
    )
    .get(sceneId)
  if (!scene) return null

  const beats = db
    .prepare(
      `SELECT id, position, kind, content, status, paragraph_ref AS paragraphRef
       FROM beats WHERE scene_id = ? ORDER BY position`
    )
    .all(sceneId)

  const file = readSceneFile(libraryRoot, scene.workFolder, scene.chapterFolder, scene.filename)
  const { chapterId, chapterNumber, chapterTitle, chapterFolder, workId, workTitle, workFolder, ...fields } = scene
  return {
    ...fields,
    chapter: { id: chapterId, number: chapterNumber, title: chapterTitle },
    work: { id: workId, title: workTitle },
    path: file.path,
    wordcount: file.wordcount,
    paragraphs: file.paragraphs,
    fileError: file.fileError,
    beats
  }
}

// Prose viewer: the scene's file split into paragraphs, in order. The
// split is splitParagraphs, the same function countProse counts with, so
// paragraph N here is what a beat's paragraph_ref N points at. Read-only:
// the file is only ever read. The wordcount is counted from those same
// paragraphs, as countProse does, so it matches the scene detail's.
// previous and next are the scenes either side in the work's reading
// order, crossing chapter ends; null at the work's first and last scene.
// Returns null for an unknown scene; a file that can't be read gives
// paragraphs: null and wordcount: null plus fileError.
export function sceneProse(db, libraryRoot, sceneId) {
  const scene = db
    .prepare(
      `SELECT s.id, s.title, s.filename,
              c.id AS chapterId, c.number AS chapterNumber, c.title AS chapterTitle, c.folder AS chapterFolder,
              w.id AS workId, w.title AS workTitle, w.folder AS workFolder
       FROM scenes s
       JOIN chapters c ON c.id = s.chapter_id
       JOIN works w ON w.id = c.work_id
       WHERE s.id = ?`
    )
    .get(sceneId)
  if (!scene) return null

  const order = workReadingOrder(db, scene.workId)
  const at = order.findIndex((s) => s.id === scene.id)
  return {
    id: scene.id,
    title: scene.title,
    chapter: { id: scene.chapterId, number: scene.chapterNumber, title: scene.chapterTitle },
    work: { id: scene.workId, title: scene.workTitle },
    ...readProse(scenePath(libraryRoot, scene.workFolder, scene.chapterFolder, scene.filename)),
    previous: order[at - 1] ?? null,
    next: order[at + 1] ?? null
  }
}

// A scene file's paragraphs and wordcount, for the prose viewers. Only
// ever reads. A file that can't be read gives paragraphs: null and
// wordcount: null plus fileError.
function readProse(file) {
  try {
    const paragraphs = splitParagraphs(fs.readFileSync(file, 'utf8'))
    return { path: file, paragraphs, wordcount: paragraphs.reduce((sum, p) => sum + countWords(p), 0), fileError: null }
  } catch (e) {
    return { path: file, paragraphs: null, wordcount: null, fileError: e.code ?? e.message }
  }
}

// Every scene in a work in reading order: by chapter number, then by
// position within the chapter. For flipping from scene to scene across
// chapter ends.
function workReadingOrder(db, workId) {
  return db
    .prepare(
      `SELECT s.id, s.title, s.position, c.id AS chapterId, c.number AS chapterNumber
       FROM scenes s JOIN chapters c ON c.id = s.chapter_id
       WHERE c.work_id = ?
       ORDER BY c.number, s.position`
    )
    .all(workId)
}

// Whole-chapter prose: every scene's file, in order, each split into
// paragraphs exactly as sceneProse does, so paragraph numbers (which
// restart per scene) match the single-scene viewer. previous and next are
// the work's chapters either side, by number. Returns null for an unknown
// chapter.
export function chapterProse(db, libraryRoot, chapterId) {
  const chapter = db
    .prepare(
      `SELECT c.id, c.number, c.title, c.folder, w.id AS workId, w.title AS workTitle, w.folder AS workFolder
       FROM chapters c JOIN works w ON w.id = c.work_id
       WHERE c.id = ?`
    )
    .get(chapterId)
  if (!chapter) return null

  const scenes = db
    .prepare('SELECT id, position, title, filename FROM scenes WHERE chapter_id = ? ORDER BY position')
    .all(chapterId)
    .map(({ filename, ...scene }) => ({
      ...scene,
      ...readProse(scenePath(libraryRoot, chapter.workFolder, chapter.folder, filename))
    }))

  const chapters = db
    .prepare('SELECT id, number, title FROM chapters WHERE work_id = ? ORDER BY number')
    .all(chapter.workId)
  const at = chapters.findIndex((c) => c.id === chapter.id)
  return {
    id: chapter.id,
    number: chapter.number,
    title: chapter.title,
    work: { id: chapter.workId, title: chapter.workTitle },
    scenes,
    ...total(scenes),
    previous: chapters[at - 1] ?? null,
    next: chapters[at + 1] ?? null
  }
}

// Work total: scene counts summed per chapter, chapter totals summed.
export function workWordcount(db, libraryRoot, workId) {
  const rows = db
    .prepare(
      `SELECT c.id AS chapterId, c.number, c.folder AS chapterFolder, s.filename, w.folder AS workFolder
       FROM works w
       JOIN chapters c ON c.work_id = w.id
       LEFT JOIN scenes s ON s.chapter_id = c.id
       WHERE w.id = ?
       ORDER BY c.number, s.position`
    )
    .all(workId)

  const byChapter = new Map()
  for (const r of rows) {
    if (!byChapter.has(r.chapterId)) byChapter.set(r.chapterId, { id: r.chapterId, number: r.number, scenes: [] })
    if (r.filename !== null) {
      byChapter.get(r.chapterId).scenes.push(readSceneFile(libraryRoot, r.workFolder, r.chapterFolder, r.filename))
    }
  }
  const chapters = [...byChapter.values()].map(({ scenes, ...ch }) => ({ ...ch, ...total(scenes) }))
  return {
    workId,
    wordcount: chapters.reduce((sum, ch) => sum + ch.wordcount, 0),
    uncounted: chapters.reduce((sum, ch) => sum + ch.uncounted, 0),
    chapters
  }
}

// Work overview: the work's own fields, its file-derived total, and every
// chapter with its number, title, status, link and wordcount. Returns null
// for an unknown work.
export function workOverview(db, libraryRoot, workId) {
  const work = db.prepare('SELECT id, title, url, notes FROM works WHERE id = ?').get(workId)
  if (!work) return null

  const counts = new Map(workWordcount(db, libraryRoot, workId).chapters.map((ch) => [ch.id, ch]))
  const chapters = db
    .prepare(
      `SELECT id, number, title, status, posted_url AS postedUrl
       FROM chapters WHERE work_id = ? ORDER BY number`
    )
    .all(workId)
    .map((ch) => {
      const { wordcount, uncounted } = counts.get(ch.id)
      return { ...ch, wordcount, uncounted }
    })

  const sum = (key) => chapters.reduce((acc, ch) => acc + ch[key], 0)
  return { work, chapters, wordcount: sum('wordcount'), uncounted: sum('uncounted') }
}

// Home page: every work with its link and file-derived total, in the
// sidebar's order, plus the total across all of them. A work's uncounted
// scenes are left out of both totals and reported, as on its overview.
export function libraryOverview(db, libraryRoot) {
  const works = db
    .prepare(
      `SELECT w.id, w.title, w.url, count(c.id) AS chapterCount
       FROM works w LEFT JOIN chapters c ON c.work_id = w.id
       GROUP BY w.id
       ORDER BY w.title COLLATE NOCASE, w.id`
    )
    .all()
    .map((work) => {
      const { wordcount, uncounted } = workWordcount(db, libraryRoot, work.id)
      return { ...work, wordcount, uncounted }
    })
  const sum = (key) => works.reduce((acc, w) => acc + w[key], 0)
  return { works, wordcount: sum('wordcount'), uncounted: sum('uncounted') }
}

// Previously used beat kinds and POVs, most used first, ties alphabetical.
// Case-sensitive, like the spec's DISTINCT. Blank values (an imported
// scene's POV before it's filled in) aren't suggestions.
export function suggestions(db) {
  const usage = (column, table) =>
    db
      .prepare(
        `SELECT ${column} AS value, count(*) AS count FROM ${table}
         WHERE ${column} <> ''
         GROUP BY ${column} ORDER BY count DESC, ${column}`
      )
      .all()
  return { kinds: usage('kind', 'beats'), povs: usage('pov', 'scenes') }
}
