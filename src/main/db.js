import { app } from 'electron'
import path from 'node:path'
import { openSqlite } from './sqlite.js'

export function databasePath() {
  return path.join(app.getPath('userData'), 'fic-bible.sqlite')
}

let db = null

export function openDatabase() {
  if (!db) {
    db = openSqlite(databasePath())
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
