import fs from 'node:fs'
import path from 'node:path'

// Importing a library folder into the database. No Electron imports, so
// this runs under plain `node --test`.
//
// Layout (the author's convention):
//   <library root>/
//     <work folder>/            a work, titled with the folder name
//       ##-<title>/             a chapter: number ##, title <title>
//         ##-<title>.md         a scene: position ##, title <title>
//
// Reads only. Nothing on disk is created, renamed or written: the import
// adds database rows and nothing else.
//
// Rows that already exist (matched by folder or filename) are left alone,
// so edits made in the app survive a re-import. Anything that can't be
// imported is skipped and reported with a reason, never guessed at.

const CHAPTER_NAME = /^(\d+)-(.+)$/
const SCENE_NAME = /^(\d+)-(.+)\.md$/

// Hidden entries (.git, the test-library marker, editor swap files) are
// ignored silently. Reporting them would bury the skips that matter.
const isHidden = (name) => name.startsWith('.')

function sortedEntries(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !isHidden(entry.name))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

// "03-The Long Way" -> { number: 3, title: 'The Long Way' }, or a reason it
// can't be used. The title is everything after "##-", as written.
function parseNumbered(match) {
  if (!match) return { reason: 'name does not start with a number and a hyphen (##-title)' }
  const number = Number(match[1])
  if (!Number.isSafeInteger(number) || number < 1) return { reason: 'number must be 1 or more' }
  if (match[2].trim() === '') return { reason: 'nothing after the number to use as a title' }
  return { number, title: match[2] }
}

// What's on disk, as a tree, plus what was skipped and why. Paths in
// `skipped` are relative to the library root.
export function scanLibrary(libraryRoot) {
  const skipped = []
  const skip = (segments, reason) => skipped.push({ path: path.join(...segments), reason })
  const works = []

  for (const entry of sortedEntries(libraryRoot)) {
    if (entry.isSymbolicLink()) skip([entry.name], 'symbolic link')
    else if (!entry.isDirectory()) skip([entry.name], 'file at the top of the library, not in a work folder')
    else works.push({ folder: entry.name, title: entry.name, chapters: scanWork(libraryRoot, entry.name, skip) })
  }
  return { works, skipped }
}

function scanWork(libraryRoot, workFolder, skip) {
  const chapters = []
  for (const entry of sortedEntries(path.join(libraryRoot, workFolder))) {
    const at = [workFolder, entry.name]
    if (entry.isSymbolicLink()) skip(at, 'symbolic link')
    else if (!entry.isDirectory()) skip(at, 'file in a work folder, not in a chapter folder')
    else {
      const parsed = parseNumbered(CHAPTER_NAME.exec(entry.name))
      if (parsed.reason) skip(at, parsed.reason)
      else
        chapters.push({
          folder: entry.name,
          number: parsed.number,
          title: parsed.title,
          scenes: scanChapter(libraryRoot, workFolder, entry.name, skip)
        })
    }
  }
  return chapters
}

function scanChapter(libraryRoot, workFolder, chapterFolder, skip) {
  const scenes = []
  for (const entry of sortedEntries(path.join(libraryRoot, workFolder, chapterFolder))) {
    const at = [workFolder, chapterFolder, entry.name]
    if (entry.isSymbolicLink()) skip(at, 'symbolic link')
    else if (entry.isDirectory()) skip(at, 'folder inside a chapter; only .md files there are scenes')
    else if (!entry.isFile()) skip(at, 'not a regular file')
    // Exact, lowercase .md: matching stays case-sensitive (spec: Filename case).
    else if (!entry.name.endsWith('.md')) skip(at, 'not a .md file')
    else {
      const parsed = parseNumbered(SCENE_NAME.exec(entry.name))
      if (parsed.reason) skip(at, parsed.reason)
      else scenes.push({ filename: entry.name, position: parsed.number, title: parsed.title })
    }
  }
  return scenes
}

// Numbers used by more than one scanned item. Those items are all skipped
// (unless already imported): there's no safe way to pick between them.
function duplicateNumbers(items, key) {
  const seen = new Map()
  for (const item of items) seen.set(item[key], (seen.get(item[key]) ?? 0) + 1)
  return new Set([...seen].filter(([, n]) => n > 1).map(([number]) => number))
}

// Adds rows for everything on disk that the database doesn't have yet.
// One transaction: if anything throws, nothing is added.
//
// Returns { added: { works, chapters, scenes }, skipped: [{ path, reason }] }.
export function importLibrary(db, libraryRoot) {
  const { works, skipped } = scanLibrary(libraryRoot)
  const added = { works: 0, chapters: 0, scenes: 0 }
  const skip = (segments, reason) => skipped.push({ path: path.join(...segments), reason })

  const q = {
    work: db.prepare('SELECT id FROM works WHERE folder = ?').pluck(),
    addWork: db.prepare('INSERT INTO works (title, folder) VALUES (?, ?)'),
    chapter: db.prepare('SELECT id FROM chapters WHERE work_id = ? AND folder = ?').pluck(),
    chapterByNumber: db.prepare('SELECT folder FROM chapters WHERE work_id = ? AND number = ?').pluck(),
    addChapter: db.prepare('INSERT INTO chapters (work_id, number, title, folder) VALUES (?, ?, ?, ?)'),
    scene: db.prepare('SELECT id FROM scenes WHERE chapter_id = ? AND filename = ?').pluck(),
    sceneByCase: db
      .prepare('SELECT filename FROM scenes WHERE chapter_id = ? AND filename = ? COLLATE NOCASE')
      .pluck(),
    sceneByPosition: db.prepare('SELECT filename FROM scenes WHERE chapter_id = ? AND position = ?').pluck(),
    addScene: db.prepare(
      `INSERT INTO scenes (chapter_id, position, title, filename, pov) VALUES (?, ?, ?, ?, '')`
    )
  }

  const insertId = (statement, ...args) => Number(statement.run(...args).lastInsertRowid)

  const run = db.transaction(() => {
    for (const work of works) {
      let workId = q.work.get(work.folder)
      if (workId === undefined) {
        workId = insertId(q.addWork, work.title, work.folder)
        added.works++
      }

      const chapterDupes = duplicateNumbers(work.chapters, 'number')
      for (const chapter of work.chapters) {
        const at = [work.folder, chapter.folder]
        let chapterId = q.chapter.get(workId, chapter.folder)
        if (chapterId === undefined) {
          const taken = q.chapterByNumber.get(workId, chapter.number)
          if (chapterDupes.has(chapter.number)) {
            skip(at, `another chapter folder in this work also uses number ${chapter.number}`)
            continue
          }
          if (taken !== undefined) {
            skip(at, `chapter ${chapter.number} already exists as ${taken}`)
            continue
          }
          chapterId = insertId(q.addChapter, workId, chapter.number, chapter.title, chapter.folder)
          added.chapters++
        }

        const sceneDupes = duplicateNumbers(chapter.scenes, 'position')
        for (const scene of chapter.scenes) {
          const sceneAt = [...at, scene.filename]
          if (q.scene.get(chapterId, scene.filename) !== undefined) continue
          const sameButCase = q.sceneByCase.get(chapterId, scene.filename)
          if (sameButCase !== undefined) {
            skip(sceneAt, `name differs only in case from ${sameButCase}, which Windows treats as the same file`)
            continue
          }
          if (sceneDupes.has(scene.position)) {
            skip(sceneAt, `another scene file in this chapter also uses number ${scene.position}`)
            continue
          }
          const taken = q.sceneByPosition.get(chapterId, scene.position)
          if (taken !== undefined) {
            skip(sceneAt, `scene ${scene.position} already exists as ${taken}`)
            continue
          }
          q.addScene.run(chapterId, scene.position, scene.title, scene.filename)
          added.scenes++
        }
      }
    }
  })
  run()

  return { added, skipped }
}

// Works in the database whose folder isn't a folder in `libraryRoot`.
// Used before switching libraries, so the author can keep or clear them.
export function worksMissingFrom(db, libraryRoot) {
  return db
    .prepare('SELECT id, title, folder FROM works ORDER BY title COLLATE NOCASE, id')
    .all()
    .filter((work) => {
      try {
        return !fs.lstatSync(path.join(libraryRoot, work.folder)).isDirectory()
      } catch {
        return true
      }
    })
}

// Deletes the given works' rows; chapters, scenes and beats go with them
// (ON DELETE CASCADE). Files on disk are not touched. Returns the count.
export function deleteWorks(db, ids) {
  const del = db.prepare('DELETE FROM works WHERE id = ?')
  let count = 0
  db.transaction(() => {
    for (const id of ids) count += del.run(id).changes
  })()
  return count
}
