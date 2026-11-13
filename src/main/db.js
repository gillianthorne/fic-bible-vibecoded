import { app } from 'electron'
import path from 'node:path'
import Database from 'better-sqlite3'

// better-sqlite3 ships prebuilt binaries and prefers them by default. We
// want the copy compiled from source against Electron's headers (see the
// "config.node_gyp_force_build" entry in package.json), so point at it
// explicitly. If that build is missing, opening the database fails loudly
// rather than falling back to a prebuilt.
function nativeBindingPath() {
  const pkgDir = path.dirname(require.resolve('better-sqlite3/package.json'))
  return path.join(pkgDir, 'build', 'Release', 'better_sqlite3.node')
}

export function databasePath() {
  return path.join(app.getPath('userData'), 'fic-bible.sqlite')
}

let db = null

export function openDatabase() {
  if (!db) {
    db = new Database(databasePath(), { nativeBinding: nativeBindingPath() })
  }
  return db
}

export function closeDatabase() {
  if (db) {
    db.close()
    db = null
  }
}

export function sqliteVersion() {
  return openDatabase().prepare('SELECT sqlite_version() AS version').get().version
}
