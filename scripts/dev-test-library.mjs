// Runs the app in dev mode against a seeded test library instead of the
// real one.
//
//   npm run dev:test                 (uses dev-library/)
//   npm run dev:test -- <library>
//
// Sets FIC_BIBLE_TEST_LIBRARY here rather than inline in package.json so
// it works in Windows' cmd and PowerShell as well as POSIX shells. The app
// checks for the test-library marker itself and refuses without it.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const cli = path.join(path.dirname(require.resolve('electron-vite/package.json')), 'bin', 'electron-vite.js')
const library = path.resolve(process.argv[2] ?? 'dev-library')

const result = spawnSync(process.execPath, [cli, 'dev'], {
  stdio: 'inherit',
  env: { ...process.env, FIC_BIBLE_TEST_LIBRARY: library }
})

if (result.error) throw result.error
process.exit(result.status ?? 1)
