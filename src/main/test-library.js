import fs from 'node:fs'
import path from 'node:path'

// Dev-only: lets the app read a seeded test library instead of the real
// one. No Electron imports; index.js decides whether this is allowed.
//
// The two names are shared with the seeder (scripts/seed), which imports
// them from here so they can't drift apart.
export const MARKER = '.ficbible-test-library'
export const TEST_DB_NAME = '.ficbible-test.sqlite'

// Returns the library root as a resolved real path if it is a marked test
// library, or throws. Reads only.
export function checkTestLibrary(root) {
  let realRoot
  try {
    realRoot = fs.realpathSync(path.resolve(root))
  } catch {
    throw new Error(`Test library ${root} does not exist`)
  }
  let marker
  try {
    marker = fs.lstatSync(path.join(realRoot, MARKER))
  } catch {
    throw new Error(`${realRoot} is not a test library: it has no ${MARKER} file`)
  }
  if (!marker.isFile()) {
    throw new Error(`${realRoot} is not a test library: ${MARKER} is not a regular file`)
  }
  return realRoot
}
