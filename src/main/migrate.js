import fs from 'node:fs'
import path from 'node:path'

// Applies numbered SQL files from a directory, tracked by SQLite's
// user_version pragma. No Electron imports: also run standalone.
//
// File names are NNNN_description.sql. Numbers start at 1 and must be
// contiguous, so a missing or duplicated file is caught here rather than
// silently skipped.

const FILE_PATTERN = /^(\d{4})_[A-Za-z0-9_-]+\.sql$/

export function listMigrations(dir) {
  const migrations = fs
    .readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.sql'))
    .map((name) => {
      const match = FILE_PATTERN.exec(name)
      if (!match) {
        throw new Error(`Migration file name not in NNNN_name.sql form: ${name}`)
      }
      return { version: Number(match[1]), name, file: path.join(dir, name) }
    })
    .sort((a, b) => a.version - b.version)

  migrations.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new Error(
        `Migrations must be numbered 0001 upwards with no gaps or duplicates; ` +
          `expected ${i + 1} but found ${m.name}`
      )
    }
  })
  return migrations
}

export function currentVersion(db) {
  return db.pragma('user_version', { simple: true })
}

// Returns { from, to, applied: [names] }. Each migration and its
// user_version bump commit together; a failure rolls that migration back
// and throws, leaving earlier ones applied and later ones untried.
export function migrate(db, dir) {
  const migrations = listMigrations(dir)
  const from = currentVersion(db)
  const latest = migrations.length

  if (from > latest) {
    throw new Error(
      `Database is at schema version ${from}, but the newest migration is ${latest}. ` +
        `It was written by a newer version of the app.`
    )
  }

  const applied = []
  for (const m of migrations.slice(from)) {
    const sql = fs.readFileSync(m.file, 'utf8')
    const apply = db.transaction(() => {
      db.exec(sql)
      // Pragmas can't take bound parameters; version is an integer we parsed.
      db.pragma(`user_version = ${m.version}`)
    })
    try {
      apply()
    } catch (e) {
      throw new Error(`Migration ${m.name} failed and was rolled back: ${e.message}`)
    }
    applied.push(m.name)
  }

  return { from, to: currentVersion(db), applied }
}
