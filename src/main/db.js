import { app } from 'electron'
import path from 'node:path'
import { openSqlite } from './sqlite.js'
import { currentVersion, migrate } from './migrate.js'

export function databasePath() {
  return path.join(app.getPath('userData'), 'fic-bible.sqlite')
}

// The app root in dev, app.asar when packaged; Electron's fs reads into asar.
function migrationsDir() {
  return path.join(app.getAppPath(), 'migrations')
}

let db = null

// Opens the database and brings its schema up to date. If a migration
// fails, the connection is closed and the error propagates, so the app
// never works against a half-migrated schema.
export function openDatabase() {
  if (!db) {
    const conn = openSqlite(databasePath())
    try {
      migrate(conn, migrationsDir())
    } catch (e) {
      conn.close()
      throw e
    }
    db = conn
  }
  return db
}

export function schemaVersion() {
  return currentVersion(openDatabase())
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
