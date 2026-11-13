// Uses the Electron-built SQLite module: run through `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MARKER } from '../scripts/seed/guard.mjs'
import { DB_NAME, seed } from '../scripts/seed/seed.mjs'
import { openSqlite } from '../src/main/sqlite.js'

function markedLibrary() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fic-bible-seed-')))
  fs.writeFileSync(path.join(root, MARKER), '')
  return root
}

function listing(root) {
  return fs.readdirSync(root, { recursive: true }).map((p) => p.split(path.sep).join('/')).sort()
}

test('without a marker, seeding writes nothing at all', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fic-bible-seed-'))
  assert.throws(() => seed(root), /Refusing to seed/)
  assert.deepEqual(fs.readdirSync(root), [])
})

test('re-running produces identical rows and files', () => {
  const root = markedLibrary()
  const first = seed(root)
  const filesBefore = listing(root)
  const dump = () => {
    const db = openSqlite(path.join(root, DB_NAME))
    const out = ['works', 'chapters', 'scenes', 'beats'].map((t) =>
      db.prepare(`SELECT * FROM ${t} ORDER BY id`).all().map(({ id, ...rest }) => rest)
    )
    db.close()
    return out
  }
  const rowsBefore = dump()
  assert.deepEqual(seed(root), first)
  assert.deepEqual(listing(root), filesBefore)
  assert.deepEqual(dump(), rowsBefore)
})

test('never overwrites a file it did not create', () => {
  const root = markedLibrary()
  fs.mkdirSync(path.join(root, 'lantern-road', 'chapter-01'), { recursive: true })
  const mine = path.join(root, 'lantern-road', 'chapter-01', 'scene-01.md')
  fs.writeFileSync(mine, 'Not the seeder\'s.')
  assert.throws(() => seed(root), /Refusing to overwrite/)
  assert.equal(fs.readFileSync(mine, 'utf8'), 'Not the seeder\'s.')
})

test('a wipe leaves unrelated files and their folders alone', () => {
  const root = markedLibrary()
  seed(root)
  const stray = path.join(root, 'salt-and-static', 'notes.txt')
  fs.writeFileSync(stray, 'mine')
  seed(root)
  assert.equal(fs.readFileSync(stray, 'utf8'), 'mine')
})

test('covers the requested edge cases', () => {
  const root = markedLibrary()
  const { edgeCases } = seed(root)
  assert.ok(edgeCases.workWithNoChapters)
  assert.ok(edgeCases.chapterWithOneScene)
  assert.ok(edgeCases.sceneWithNoBeats)
  assert.ok(edgeCases.crlfScene)
  assert.ok(edgeCases.emptyScenes.length >= 1)
  assert.ok(edgeCases.longChapterTitle)
  assert.ok(edgeCases.longSceneTitle)

  const db = openSqlite(path.join(root, DB_NAME))
  const distinct = (sql) => db.prepare(sql).pluck().all()
  assert.deepEqual(distinct('SELECT DISTINCT status FROM chapters ORDER BY 1'), ['drafting', 'posted', 'ready to post'])
  assert.deepEqual(distinct('SELECT DISTINCT status FROM scenes ORDER BY 1'), ['drafted', 'drafting', 'outlined', 'revised'])
  assert.deepEqual(distinct('SELECT DISTINCT status FROM beats ORDER BY 1'), ['cut', 'in draft', 'planned'])
  // Repeated values for the suggestion queries to deduplicate.
  assert.ok(db.prepare('SELECT count(*) > count(DISTINCT pov) FROM scenes').pluck().get())
  assert.ok(db.prepare('SELECT count(*) > count(DISTINCT kind) FROM beats').pluck().get())
  // Some refs set, some null; scene and beat counts within the asked ranges.
  assert.ok(db.prepare('SELECT count(paragraph_ref) > 0 AND count(*) > count(paragraph_ref) FROM beats').pluck().get())
  const perChapter = distinct('SELECT count(*) FROM scenes GROUP BY chapter_id')
  assert.ok(perChapter.every((n) => n === 1 || (n >= 2 && n <= 6)))
  const perScene = distinct('SELECT count(b.id) FROM scenes s LEFT JOIN beats b ON b.scene_id = s.id GROUP BY s.id')
  assert.ok(perScene.every((n) => n === 0 || (n >= 3 && n <= 8)))
  db.close()
})
