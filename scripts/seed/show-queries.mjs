// Dev-only: prints every screen query's output against a seeded test library.
//
//   npm run show-queries -- <test-library-root>
//
// Read-only. Opens only the seeder's database inside a marked test library.
import path from 'node:path'
import { testDatabasePath } from './seed.mjs'
import { requireTestLibrary } from './guard.mjs'
import { openSqlite } from '../../src/main/sqlite.js'
import {
  chapterOverview, navigationTree, sceneDetail, suggestions, workWordcount
} from '../../src/main/queries.js'

const root = requireTestLibrary(process.argv[2])
const db = openSqlite(testDatabasePath(root))

const heading = (title) => console.log(`\n=== ${title} ===`)
const json = (value) => console.log(JSON.stringify(value, null, 2))
const id = (sql, ...args) => db.prepare(sql).pluck().get(...args)
const chapterId = (title) => id('SELECT id FROM chapters WHERE title = ?', title)
const sceneAt = (work, chapter, position) =>
  id(
    `SELECT s.id FROM scenes s JOIN chapters c ON c.id = s.chapter_id JOIN works w ON w.id = c.work_id
     WHERE w.title = ? AND c.number = ? AND s.position = ?`,
    work, chapter, position
  )

try {
  heading('navigationTree (one line per node)')
  for (const w of navigationTree(db)) {
    console.log(`work ${w.id} ${JSON.stringify(w.title)}${w.chapters.length ? '' : '  (no chapters)'}`)
    for (const c of w.chapters) {
      console.log(`  chapter ${c.id}  #${c.number} ${JSON.stringify(c.title)}  [${c.status}]`)
      for (const s of c.scenes) console.log(`    scene ${s.id}  ${s.position}. ${JSON.stringify(s.title)}  [${s.status}]`)
    }
  }

  heading('chapterOverview: Salt and Static ch 1 "Signal"')
  json(chapterOverview(db, root, chapterId('Signal')))

  heading('chapterOverview: Salt and Static ch 2 (scene with no beats)')
  json(chapterOverview(db, root, chapterId('The Tide Tables')))

  heading('chapterOverview: Salt and Static ch 5 (empty scene file)')
  json(chapterOverview(db, root, chapterId('What the Radio Said')))

  heading('sceneDetail: The Lantern Road ch 1 scene 2 (CRLF file)')
  json(sceneDetail(db, root, sceneAt('The Lantern Road', 1, 2)))

  heading('workWordcount: every work')
  for (const w of navigationTree(db)) json({ title: w.title, ...workWordcount(db, root, w.id) })

  heading('suggestions')
  json(suggestions(db))
} finally {
  db.close()
}
