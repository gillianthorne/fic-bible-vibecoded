// The seeder's safety guard. Nothing in the seeder may touch the disk or
// open a database until requireTestLibrary() has returned.
//
// A library is only a test library if its root contains a regular file
// named .ficbible-test-library. Real libraries never have one, so the
// seeder cannot wipe or write into them.
import fs from 'node:fs'
import path from 'node:path'

export const MARKER = '.ficbible-test-library'

// Returns the library root as a resolved real path, or throws. Reads only.
export function requireTestLibrary(root) {
  if (!root) {
    throw new Error('No library root given. Usage: npm run seed -- <test-library-root>')
  }

  let realRoot
  try {
    realRoot = fs.realpathSync(path.resolve(root))
  } catch {
    throw refusal(root, 'the folder does not exist')
  }

  let marker
  try {
    marker = fs.lstatSync(path.join(realRoot, MARKER))
  } catch {
    throw refusal(realRoot, `it has no ${MARKER} file`)
  }
  // A folder or link with the marker's name is not the marker.
  if (!marker.isFile()) {
    throw refusal(realRoot, `${MARKER} exists but is not a regular file`)
  }
  return realRoot
}

function refusal(root, reason) {
  return new Error(
    `Refusing to seed ${root}: ${reason}.\n` +
      `The seeder deletes and regenerates everything it manages, so it only runs ` +
      `in a library marked as disposable test data by an empty ${MARKER} file at its root. ` +
      `Nothing was written.`
  )
}
