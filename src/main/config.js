import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

// Hardcoded fallback for the spike: the library/ folder next to the app.
// In dev that's the repo's library/. In a packaged build it doesn't exist,
// so a packaged app needs a config.json.
function fallbackLibraryRoot() {
  return path.join(app.getAppPath(), 'library')
}

export function configPath() {
  return path.join(app.getPath('userData'), 'config.json')
}

// Reads config.json from the userData folder. The app never creates or
// writes this file. A missing file or a missing libraryRoot means the
// fallback is used. A file that exists but is broken is an error: silently
// ignoring it would hide the mistake.
export function resolveLibraryRoot() {
  const file = configPath()

  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch (e) {
    if (e.code === 'ENOENT') {
      return { libraryRoot: fallbackLibraryRoot(), source: 'fallback (no config.json)', configPath: file }
    }
    throw e
  }

  let config
  try {
    config = JSON.parse(raw)
  } catch (e) {
    throw new Error(`${file} is not valid JSON: ${e.message}`)
  }

  if (config.libraryRoot === undefined) {
    return { libraryRoot: fallbackLibraryRoot(), source: 'fallback (config.json has no libraryRoot)', configPath: file }
  }
  if (typeof config.libraryRoot !== 'string' || !path.isAbsolute(config.libraryRoot)) {
    throw new Error(`libraryRoot in ${file} must be an absolute path`)
  }
  return { libraryRoot: path.normalize(config.libraryRoot), source: 'config.json', configPath: file }
}
