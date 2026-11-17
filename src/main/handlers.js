import {
  chapterOverview,
  characterProfile,
  chapterProse,
  editNotes,
  libraryOverview,
  navigationTree,
  sceneDetail,
  sceneProse,
  suggestions,
  workOverview
} from './queries.js'
import { checkLink } from './links.js'
import { searchCharacters } from './search.js'
import { readCharacterNotes, readSceneSource, saveCharacterNotes, saveSceneSource } from './save.js'
import { createChapter, createCharacter, createScene, createWork } from './create.js'
import { deleteWorks, importLibrary, worksMissingFrom } from './import.js'
import {
  createBeat,
  createCharacterField,
  createEditNote,
  deleteBeat,
  deleteCharacter,
  deleteCharacterField,
  deleteEditNote,
  moveBeat,
  moveCharacterField,
  updateBeat,
  updateChapter,
  updateCharacter,
  updateCharacterField,
  updateEditNote,
  updateScene,
  updateWork
} from './edit.js'

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

// `links` is how a link reaches the browser, injected so tests can fake
// it: { openExternal(url) -> Promise }. null means links can't be opened.
export function createHandlers(open, library = null, links = null) {
  return {
    // Hands an http(s) link to the default browser. Anything else is
    // refused here, in the main process, whatever the renderer sent.
    'link:open': (url) =>
      respondAsync(async () => {
        const href = checkLink(url)
        if (!links) throw new Error('Links can’t be opened here.')
        await links.openExternal(href)
        return null
      }),

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

    // The home page: every work and the total across them.
    'library:overview': () =>
      respond(() => {
        const { db, libraryRoot } = open()
        return libraryOverview(db, libraryRoot)
      }),

    // data is null for a work that doesn't exist.
    'work:overview': (workId) =>
      respond(() => {
        const id = requireId(workId, 'workId')
        const { db, libraryRoot } = open()
        return workOverview(db, libraryRoot, id)
      }),

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

    // Edit notes: rows only, never the scene file. The same shape as beats.
    'editNote:list': (sceneId) => respond(() => editNotes(open().db, requireId(sceneId, 'sceneId'))),
    'editNote:create': (sceneId, fields) => respond(() => createEditNote(open().db, sceneId, fields)),
    'editNote:update': (noteId, patch) => respond(() => (updateEditNote(open().db, noteId, patch), null)),
    'editNote:delete': (noteId) => respond(() => (deleteEditNote(open().db, noteId), null)),

    'scene:update': (sceneId, patch) => respond(() => (updateScene(open().db, sceneId, patch), null)),
    'chapter:update': (chapterId, patch) => respond(() => (updateChapter(open().db, chapterId, patch), null)),
    // Creating: a row plus an empty folder or scene file, at the end.
    // Each returns the new row's id.
    'work:create': (title) =>
      respond(() => {
        const { db, libraryRoot } = open()
        return createWork(db, libraryRoot, title)
      }),
    'chapter:create': (workId, title) =>
      respond(() => {
        const { db, libraryRoot } = open()
        return createChapter(db, libraryRoot, workId, title)
      }),
    'scene:create': (chapterId, title) =>
      respond(() => {
        const { db, libraryRoot } = open()
        return createScene(db, libraryRoot, chapterId, title)
      }),

    'work:update': (workId, patch) => respond(() => (updateWork(open().db, workId, patch), null)),

    // Characters. Creating makes an empty notes file in the work's
    // characters folder; every other edit is database rows only, and
    // deleting leaves the notes file on disk.
    'character:profile': (characterId) =>
      respond(() => characterProfile(open().db, requireId(characterId, 'characterId'))),
    'character:create': (workId, name) =>
      respond(() => {
        const { db, libraryRoot } = open()
        return createCharacter(db, libraryRoot, workId, name)
      }),
    'character:update': (characterId, patch) =>
      respond(() => (updateCharacter(open().db, characterId, patch), null)),
    'character:delete': (characterId) => respond(() => (deleteCharacter(open().db, characterId), null)),
    'characterField:create': (characterId, fields) =>
      respond(() => createCharacterField(open().db, characterId, fields)),
    'characterField:update': (fieldId, patch) =>
      respond(() => (updateCharacterField(open().db, fieldId, patch), null)),
    'characterField:move': (fieldId, direction) =>
      respond(() => (moveCharacterField(open().db, fieldId, direction), null)),
    'characterField:delete': (fieldId) => respond(() => (deleteCharacterField(open().db, fieldId), null)),

    // Every work's characters whose name, age, birthday, fields or notes
    // file hold the text, ignoring case. Reads only.
    'search:characters': (query) =>
      respond(() => {
        const { db, libraryRoot } = open()
        return searchCharacters(db, libraryRoot, query)
      }),

    // A character's notes file, for the profile's editor. data is null for
    // a character that doesn't exist. Saving is guarded as scene:save is.
    'character:notes': (characterId) =>
      respond(() => {
        const { db, libraryRoot } = open()
        return readCharacterNotes(db, libraryRoot, characterId)
      }),
    'character:saveNotes': (characterId, text, baseHash) =>
      respond(() => {
        const { db, libraryRoot } = open()
        return saveCharacterNotes(db, libraryRoot, characterId, text, baseHash)
      }),

    // Previously used beat kinds and POVs, for the inputs' suggestions.
    suggestions: () => respond(() => suggestions(open().db)),

    // data is null for a chapter that doesn't exist.
    'chapter:prose': (chapterId) =>
      respond(() => {
        const id = requireId(chapterId, 'chapterId')
        const { db, libraryRoot } = open()
        return chapterProse(db, libraryRoot, id)
      }),

    // The prose editor. data is null for a scene that doesn't exist.
    'scene:source': (sceneId) =>
      respond(() => {
        const { db, libraryRoot } = open()
        return readSceneSource(db, libraryRoot, sceneId)
      }),

    // One of the two writes to a file with content (with
    // character:saveNotes): refused if the file changed on disk since
    // baseHash was read. data is { hash, written }.
    'scene:save': (sceneId, text, baseHash) =>
      respond(() => {
        const { db, libraryRoot } = open()
        return saveSceneSource(db, libraryRoot, sceneId, text, baseHash)
      }),

    // data is null for a scene that doesn't exist.
    'scene:prose': (sceneId) =>
      respond(() => {
        const id = requireId(sceneId, 'sceneId')
        const { db, libraryRoot } = open()
        return sceneProse(db, libraryRoot, id)
      })
  }
}
