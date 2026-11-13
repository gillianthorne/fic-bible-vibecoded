// Dev-only seeder: fills a marked test library with generated works,
// chapters, scenes (with prose files) and beats. Not part of the app.
//
//   npm run seed -- <test-library-root>
//
// Safety:
// - Refuses unless the root has a .ficbible-test-library marker (guard.mjs),
//   checked before anything is opened or written.
// - Uses its own database inside the test library, never the app's.
// - Creates files with the 'wx' flag, so it never overwrites anything.
// - On re-run, deletes only the files and folders its manifest says it made.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { requireTestLibrary } from './guard.mjs'
import { openSqlite } from '../../src/main/sqlite.js'
import { migrate } from '../../src/main/migrate.js'
import { scenePath } from '../../src/main/paths.js'
import * as data from './data.mjs'

export const DB_NAME = '.ficbible-test.sqlite'
const MANIFEST_NAME = '.ficbible-seed-manifest.json'
const SEED = 20261113
const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations')

export function testDatabasePath(root) {
  return path.join(requireTestLibrary(root), DB_NAME)
}

export function seed(rootArg) {
  const root = requireTestLibrary(rootArg) // must stay first
  const manifestFile = path.join(root, MANIFEST_NAME)

  wipeFiles(root, manifestFile)

  const db = openSqlite(path.join(root, DB_NAME))
  const created = { files: [], dirs: [] }
  try {
    migrate(db, migrationsDir)
    const summary = db.transaction(() => {
      db.prepare('DELETE FROM works').run() // cascades to everything
      return generate(db, root, created)
    })()
    return summary
  } finally {
    // Record whatever was made, even on failure, so the next run can clean it.
    fs.writeFileSync(manifestFile, JSON.stringify(created, null, 2) + '\n')
    db.close()
  }
}

// Paths in the manifest are relative to the root and must stay inside it.
function inside(root, rel) {
  const full = path.resolve(root, rel)
  const back = path.relative(root, full)
  if (!back || back.startsWith('..') || path.isAbsolute(back)) {
    throw new Error(`Manifest entry escapes the test library: ${rel}`)
  }
  return full
}

function wipeFiles(root, manifestFile) {
  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  } catch (e) {
    if (e.code === 'ENOENT') return
    throw new Error(`Cannot read ${manifestFile}: ${e.message}`)
  }
  for (const rel of manifest.files) fs.rmSync(inside(root, rel), { force: true })
  // Deepest first; a folder that now holds something else is left alone.
  const dirs = [...manifest.dirs].sort((a, b) => b.length - a.length)
  for (const rel of dirs) {
    try {
      fs.rmdirSync(inside(root, rel))
    } catch (e) {
      if (e.code === 'ENOTEMPTY') console.warn(`Left ${rel} in place: it contains files the seeder did not create.`)
      else if (e.code !== 'ENOENT') throw e
    }
  }
  fs.rmSync(manifestFile)
}

function makeDir(root, rel, created) {
  try {
    fs.mkdirSync(path.join(root, rel))
    created.dirs.push(rel)
  } catch (e) {
    if (e.code !== 'EEXIST') throw e // existing folder: use it, never delete it
  }
}

function createFile(root, rel, text, created) {
  try {
    fs.writeFileSync(path.join(root, rel), text, { flag: 'wx' })
  } catch (e) {
    if (e.code === 'EEXIST') {
      throw new Error(`Refusing to overwrite ${rel}: it exists and the seeder did not create it.`)
    }
    throw e
  }
  created.files.push(rel)
}

function generate(db, root, created) {
  const r = data.rng(SEED)
  const insertWork = db.prepare('INSERT INTO works (title, folder) VALUES (?, ?)')
  const insertChapter = db.prepare(
    `INSERT INTO chapters (work_id, number, title, folder, status, posted_date, posted_url)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  const insertScene = db.prepare(
    `INSERT INTO scenes (chapter_id, position, title, filename, pov, status)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
  const insertBeat = db.prepare(
    `INSERT INTO beats (scene_id, position, kind, content, status, paragraph_ref)
     VALUES (?, ?, ?, ?, ?, ?)`
  )

  const summary = { works: 0, chapters: 0, scenes: 0, beats: 0, edgeCases: {} }
  let sceneIndex = 0
  let postedDay = Date.UTC(2026, 7, 2)

  for (const work of data.OUTLINE) {
    const workId = insertWork.run(work.title, work.folder).lastInsertRowid
    makeDir(root, work.folder, created)
    summary.works++
    if (work.chapters.length === 0) summary.edgeCases.workWithNoChapters = work.title

    work.chapters.forEach((ch, ci) => {
      const number = ci + 1
      const chFolder = `chapter-${String(number).padStart(2, '0')}`
      const posted = ch.status === 'posted'
      const chapterId = insertChapter.run(
        workId, number, ch.title, chFolder, ch.status,
        posted ? new Date(postedDay).toISOString().slice(0, 10) : null,
        posted ? `https://example.invalid/${work.folder}/chapter-${number}` : null
      ).lastInsertRowid
      if (posted) postedDay += 14 * 86400000
      makeDir(root, path.join(work.folder, chFolder), created)
      summary.chapters++
      if (ch.scenes === 1) summary.edgeCases.chapterWithOneScene = `${work.title} ch ${number}`

      for (let position = 1; position <= ch.scenes; position++) {
        const special = ch.special?.[position]
        const pov = r.pick(data.POVS)
        const status = special === 'empty' ? 'outlined' : data.sceneStatus(r, ch.status)
        const filename = `scene-${String(position).padStart(2, '0')}.md`
        const where = `${work.title} ch ${number} scene ${position}`

        // Outlined scenes have an empty file, as a freshly created scene would.
        const paragraphs = status === 'outlined' ? [] : data.prose(r, pov)
        let text = paragraphs.length ? paragraphs.join('\n\n') + '\n' : ''
        if (special === 'crlf') {
          text = text.replace(/\n/g, '\r\n')
          summary.edgeCases.crlfScene = where
        }
        if (!text) (summary.edgeCases.emptyScenes ??= []).push(where)
        createFile(root, path.relative(root, scenePath(root, work.folder, chFolder, filename)), text, created)

        const sceneId = insertScene.run(
          chapterId, position, data.sceneTitle(sceneIndex++), filename, pov, status
        ).lastInsertRowid
        summary.scenes++

        if (special === 'no-beats') {
          summary.edgeCases.sceneWithNoBeats = where
          continue
        }
        for (let b = 1, n = r.int(3, 8); b <= n; b++) {
          const kind = r.pick(data.KINDS)
          const beatStatus = data.beatStatus(r, status)
          // Only landed beats point into the prose, and only at real paragraphs.
          const ref =
            beatStatus === 'in draft' && paragraphs.length && r.chance(0.6)
              ? r.int(1, paragraphs.length)
              : null
          insertBeat.run(sceneId, b, kind, data.beatContent(r, kind, pov), beatStatus, ref)
          summary.beats++
        }
      }
    })
  }
  return summary
}

// CLI
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const summary = seed(process.argv[2])
    console.log(`Seeded ${path.resolve(process.argv[2])}`)
    console.log(JSON.stringify(summary, null, 2))
  } catch (e) {
    console.error(e.message)
    process.exitCode = 1
  }
}
