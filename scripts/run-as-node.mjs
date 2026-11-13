// Runs a script with Electron's bundled Node instead of the system Node.
//
// The SQLite native module is compiled against Electron, so system Node
// can't load it. ELECTRON_RUN_AS_NODE makes the Electron binary behave as
// plain Node. Setting it here rather than inline in package.json keeps the
// npm scripts working in Windows' cmd as well as POSIX shells.
//
//   node scripts/run-as-node.mjs <script> [args...]
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electron = require('electron') // under system Node this is the binary's path

const result = spawnSync(electron, process.argv.slice(2), {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})

if (result.error) throw result.error
process.exit(result.status ?? 1)
