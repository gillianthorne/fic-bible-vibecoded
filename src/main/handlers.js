import { chapterOverview, navigationTree, sceneDetail, sceneProse } from './queries.js'
import { deleteWorks, importLibrary, worksMissingFrom } from './import.js'
import { createBeat, deleteBeat, moveBeat, updateBeat } from './edit.js'

// What the renderer can ask for, one function per IPC channel. No Electron
// imports, so these are tested with plain `node --test`.
//
// Every handler returns { ok: true, data } or { ok: false, error } rather
// than throwing: a thrown error reaches the renderer with its message
// wrapped in "Error invoking remote method ..." and its properties lost.
//
// `open` is called on every request and returns { db, libraryRoot }. It may
// throw (database not ready, bad config); that becomes an { ok: false }.
//
// `library` is what changing the library needs from Electron, injected so
// tests can fake it. null means the library can't be changed (a dev test
// library, whose database is read-only):
//   current()                    -> { libraryRoot, source }
//   chooseFolder()               -> Promise<absolute path | null if cancelled>
//   confirmMissing(works, root)  -> Promise<'keep' | 'clear' | 'cancel'>
//   save(root)                   -> the saved path

function respond(fn) {
  try {
    return { ok: true, data: fn() }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

async function respondAsync(fn) {
  try {
    return { ok: true, data: await fn() }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

function requireLibrary(library) {
  if (!library) throw new Error('The library can’t be changed while the app is using a test library.')
  return library
}

function requireId(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer, got ${JSON.stringify(value)}`)
  }
  return value
}

export function createHandlers(open, library = null) {
  return {
    'library:info': () =>
      respond(() =>
        library
          ? { ...library.current(), canChange: true }
          : { libraryRoot: open().libraryRoot, source: 'test library', canChange: false }
      ),

    // Pick a folder, decide about works that aren't in it, save it to
    // config, then import it. data is null if the author cancelled at
    // either step, in which case nothing has changed. Clearing and
    // importing are one transaction.
    'library:choose': () =>
      respondAsync(async () => {
        const lib = requireLibrary(library)
        const root = await lib.chooseFolder()
        if (!root) return null
        const { db } = open()
        const missing = worksMissingFrom(db, root)
        const decision = missing.length > 0 ? await lib.confirmMissing(missing, root) : 'keep'
        if (decision === 'cancel') return null
        const libraryRoot = lib.save(root)
        return db.transaction(() => {
          const cleared = decision === 'clear' ? deleteWorks(db, missing.map((w) => w.id)) : 0
          return { libraryRoot, cleared, ...importLibrary(db, libraryRoot) }
        })()
      }),

    // Re-import the current library, picking up files added since.
    'library:import': () =>
      respond(() => {
        requireLibrary(library)
        const { db, libraryRoot } = open()
        return { libraryRoot, cleared: 0, ...importLibrary(db, libraryRoot) }
      }),

    'nav:tree': () => respond(() => navigationTree(open().db)),

    // data is null for a chapter that doesn't exist.
    'chapter:overview': (chapterId) =>
      respond(() => {
        const id = requireId(chapterId, 'chapterId')
        const { db, libraryRoot } = open()
        return chapterOverview(db, libraryRoot, id)
      }),

    // data is null for a scene that doesn't exist.
    'scene:detail': (sceneId) =>
      respond(() => {
        const id = requireId(sceneId, 'sceneId')
        const { db, libraryRoot } = open()
        return sceneDetail(db, libraryRoot, id)
      }),

    // Beat edits. Each returns the beat's id (create) or null; the screen
    // reads the scene again afterwards.
    'beat:create': (sceneId, fields) => respond(() => createBeat(open().db, sceneId, fields)),
    'beat:update': (beatId, patch) => respond(() => (updateBeat(open().db, beatId, patch), null)),
    'beat:move': (beatId, direction) => respond(() => (moveBeat(open().db, beatId, direction), null)),
    'beat:delete': (beatId) => respond(() => (deleteBeat(open().db, beatId), null)),

    // data is null for a scene that doesn't exist.
    'scene:prose': (sceneId) =>
      respond(() => {
        const id = requireId(sceneId, 'sceneId')
        const { db, libraryRoot } = open()
        return sceneProse(db, libraryRoot, id)
      })
  }
}
