import path from 'node:path'

// The one place a scene's full path is assembled (spec: Path layering).
// The database stores one segment per level; only the library root is
// absolute, and it comes from config, never from a row.
export function scenePath(libraryRoot, workFolder, chapterFolder, filename) {
  return path.join(libraryRoot, workFolder, chapterFolder, filename)
}
