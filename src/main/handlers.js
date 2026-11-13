import { chapterOverview, navigationTree } from './queries.js'

// What the renderer can ask for, one function per IPC channel. No Electron
// imports, so these are tested with plain `node --test`.
//
// Every handler returns { ok: true, data } or { ok: false, error } rather
// than throwing: a thrown error reaches the renderer with its message
// wrapped in "Error invoking remote method ..." and its properties lost.
//
// `open` is called on every request and returns { db, libraryRoot }. It may
// throw (database not ready, bad config); that becomes an { ok: false }.

function respond(fn) {
  try {
    return { ok: true, data: fn() }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

function requireId(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer, got ${JSON.stringify(value)}`)
  }
  return value
}

export function createHandlers(open) {
  return {
    'nav:tree': () => respond(() => navigationTree(open().db)),

    // data is null for a chapter that doesn't exist.
    'chapter:overview': (chapterId) =>
      respond(() => {
        const id = requireId(chapterId, 'chapterId')
        const { db, libraryRoot } = open()
        return chapterOverview(db, libraryRoot, id)
      })
  }
}
