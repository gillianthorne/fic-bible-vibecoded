// Standalone migration runner: applies migrations/ to a database file
// without launching the app.
//
//   npm run migrate -- <path-to-database>
//
// The path is required rather than guessed: the app's database lives in
// Electron's per-user data folder, which only Electron should resolve. The
// app's status screen shows the path. Run through run-as-node.mjs (the npm
// script does this), since the SQLite module is built against Electron.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openSqlite } from '../src/main/sqlite.js'
import { currentVersion, migrate } from '../src/main/migrate.js'

const file = process.argv[2]
if (!file) {
  console.error('Usage: npm run migrate -- <path-to-database>')
  process.exit(2)
}

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const db = openSqlite(path.resolve(file))
try {
  console.log(`Database: ${db.name}`)
  console.log(`Schema version before: ${currentVersion(db)}`)
  const { to, applied } = migrate(db, migrationsDir)
  for (const name of applied) console.log(`Applied ${name}`)
  if (applied.length === 0) console.log('Already up to date.')
  console.log(`Schema version after: ${to}`)
} catch (e) {
  console.error(e.message)
  process.exitCode = 1
} finally {
  db.close()
}
