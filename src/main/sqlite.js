import path from 'node:path'
import { createRequire } from 'node:module'
import Database from 'better-sqlite3'

// No Electron imports here: this module is shared by the app and by the
// standalone migration script, so every connection is opened the same way.

const require = createRequire(import.meta.url)

// better-sqlite3 ships prebuilt binaries and prefers them by default. We
// want the copy compiled from source against Electron's headers (see the
// "config.node_gyp_force_build" entry in package.json), so point at it
// explicitly. If that build is missing, opening the database fails loudly
// rather than falling back to a prebuilt.
function nativeBindingPath() {
  const pkgDir = path.dirname(require.resolve('better-sqlite3/package.json'))
  return path.join(pkgDir, 'build', 'Release', 'better_sqlite3.node')
}

// readonly also refuses to create the file if it doesn't exist.
export function openSqlite(file, { readonly = false } = {}) {
  const db = new Database(file, { nativeBinding: nativeBindingPath(), readonly, fileMustExist: readonly })
  // Off by default in SQLite, and per-connection, so it must be set on
  // every open. Without it the REFERENCES clauses are decoration.
  db.pragma('foreign_keys = ON')
  return db
}
