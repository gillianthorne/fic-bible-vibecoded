import fs from 'node:fs'
import path from 'node:path'

// Writing config.json. No Electron imports, so it's tested with plain
// `node --test`; config.js supplies the real path.
//
// This is the app's own settings file in the per-user data folder, never a
// file under the library. Only libraryRoot is set; any other keys already
// in the file are kept. The new contents go to a temporary file that is
// then renamed over config.json, so a crash mid-write can't leave a
// half-written config behind. A config.json that isn't valid JSON is left
// untouched and reported, rather than overwritten.
export function writeLibraryRoot(file, libraryRoot) {
  if (typeof libraryRoot !== 'string' || !path.isAbsolute(libraryRoot)) {
    throw new Error(`Library folder must be an absolute path, got ${JSON.stringify(libraryRoot)}`)
  }

  let config = {}
  let raw = null
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
  }
  if (raw !== null) {
    try {
      config = JSON.parse(raw)
    } catch (e) {
      throw new Error(`${file} is not valid JSON, so it was left as it is: ${e.message}`)
    }
    if (config === null || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error(`${file} does not hold a JSON object, so it was left as it is`)
    }
  }

  config.libraryRoot = path.normalize(libraryRoot)

  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temp, JSON.stringify(config, null, 2) + '\n')
  try {
    fs.renameSync(temp, file)
  } catch (e) {
    fs.rmSync(temp, { force: true })
    throw e
  }
  return config.libraryRoot
}
