import path from 'node:path'

// The one place library paths are assembled (spec: Path layering). The
// database stores one segment per level; only the library root is
// absolute, and it comes from config, never from a row.
//
// A work's folder holds three folders with fixed names (spec: Work folder
// layout). The names are never stored in a row, so they're added here.
export const CHARACTERS = 'characters'
export const NOTES = 'notes'
export const CHAPTERS = 'chapters'
export const WORK_FOLDERS = [CHARACTERS, NOTES, CHAPTERS]

export function chaptersDir(libraryRoot, workFolder) {
  return path.join(libraryRoot, workFolder, CHAPTERS)
}

export function chapterDir(libraryRoot, workFolder, chapterFolder) {
  return path.join(libraryRoot, workFolder, CHAPTERS, chapterFolder)
}

export function scenePath(libraryRoot, workFolder, chapterFolder, filename) {
  return path.join(libraryRoot, workFolder, CHAPTERS, chapterFolder, filename)
}

export function charactersDir(libraryRoot, workFolder) {
  return path.join(libraryRoot, workFolder, CHARACTERS)
}

export function characterPath(libraryRoot, workFolder, filename) {
  return path.join(libraryRoot, workFolder, CHARACTERS, filename)
}

export function notesDir(libraryRoot, workFolder) {
  return path.join(libraryRoot, workFolder, NOTES)
}

export function notePagePath(libraryRoot, workFolder, filename) {
  return path.join(libraryRoot, workFolder, NOTES, filename)
}
