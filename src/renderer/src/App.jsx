import { useEffect, useRef, useState } from 'react'
import Sidebar from './Sidebar.jsx'
import HomePage from './HomePage.jsx'
import NavBar from './NavBar.jsx'
import WorkOverview from './WorkOverview.jsx'
import ChapterOverview from './ChapterOverview.jsx'
import SceneDetail from './SceneDetail.jsx'
import ProseViewer from './ProseViewer.jsx'
import ProseEditor from './ProseEditor.jsx'
import ChapterProse from './ChapterProse.jsx'
import ImportReport from './ImportReport.jsx'
import CharacterProfile from './CharacterProfile.jsx'
import SidebarHandle, { useSidebarWidth } from './SidebarHandle.jsx'

// Each screen sits on a sheet of paper; the kind sets how wide it may grow.
function sheetKind(selection) {
  if (selection.view === 'prose' || selection.view === 'edit') return 'prose'
  return selection.kind
}

const HOME = { kind: 'home' }

const sameScreen = (a, b) => a.kind === b.kind && a.id === b.id && a.view === b.view

// selection is { kind: 'home' }, { kind: 'work', id }, { kind: 'chapter', id, view },
// { kind: 'scene', id, view }, { kind: 'character', id }
// or { kind: 'import', report } for the result of the last import.
// view is 'prose' for the prose viewer (a scene's, or the whole chapter's),
// or 'edit' for a scene's prose editor; anything else is the scene detail or chapter overview. The sidebar
// selects with no view, so a sidebar click always opens those.
//
// history is the screens opened before this one, oldest first, for the
// back button. Every way of opening a screen goes through navigate(), so
// back works the same from the sidebar, the breadcrumb or a table row.
// Like expanded, it lasts as long as the app is open, and no longer.
//
// expanded holds only the sidebar rows the user has toggled, keyed
// 'work:<id>', 'characters:<workId>', 'chapters:<workId>' or
// 'chapter:<id>'. Anything not in it uses the default: works and their
// Chapters group open; the Characters group and each chapter closed. It lives here rather than in the sidebar so
// it lasts as long as the app is open, and no longer.
export default function App() {
  const [nav, setNav] = useState({ selection: HOME, history: [] })
  const [expanded, setExpanded] = useState({})
  // Bumped after each import or edit so the sidebar and the open screen
  // read the library again.
  const [libraryVersion, setLibraryVersion] = useState(0)
  const [sidebarWidth, setSidebarWidth] = useSidebarWidth()
  const changed = () => setLibraryVersion((v) => v + 1)
  const { selection, history } = nav

  // Each new screen starts at its top, as a new page does in a browser,
  // even when it was opened from the bottom of a long one.
  const mainPane = useRef(null)
  useEffect(() => {
    mainPane.current?.scrollTo(0, 0)
  }, [selection])

  // True while the prose editor, or a character's notes, have unsaved
  // changes. Every way of leaving a screen asks first while it is; the
  // editor clears it as it closes.
  const unsaved = useRef(false)
  const setUnsaved = (dirty) => {
    unsaved.current = dirty
  }
  const mayLeave = () =>
    !unsaved.current || window.confirm('Leave without saving? Your unsaved changes will be lost.')

  // Opening the screen that's already open adds nothing to history.
  const navigate = (next) => {
    if (sameScreen(selection, next) || !mayLeave()) return
    setNav((prev) =>
      sameScreen(prev.selection, next) ? prev : { selection: next, history: [...prev.history, prev.selection] }
    )
  }

  const goBack = () =>
    history.length > 0 &&
    mayLeave() &&
    setNav((prev) =>
      prev.history.length === 0
        ? prev
        : { selection: prev.history[prev.history.length - 1], history: prev.history.slice(0, -1) }
    )

  // A screen's own "back to" link: if that screen is the one before this,
  // it's the same as Back; otherwise it opens it as a new step.
  const backTo = (target) => {
    const previous = history[history.length - 1]
    if (previous && sameScreen(previous, target)) goBack()
    else navigate(target)
  }

  // An import can clear works, so whatever was open may be gone: show the
  // report instead. If it did clear works, earlier screens may be gone
  // too, so back starts over from the report.
  const showImport = (report) => {
    setLibraryVersion((v) => v + 1)
    const next = { kind: 'import', report }
    if (!mayLeave()) return
    if (report.cleared > 0) setNav({ selection: next, history: [] })
    else navigate(next)
  }

  const openByDefault = (key) => key.startsWith('work:') || key.startsWith('chapters:')
  const isExpanded = (key) => expanded[key] ?? openByDefault(key)
  const toggle = (key) => setExpanded((prev) => ({ ...prev, [key]: !(prev[key] ?? openByDefault(key)) }))

  // After the sidebar creates something: read the library again, unfold
  // the rows above it so it shows, and open it.
  const openCreated = (next, expandKeys) => {
    changed()
    setExpanded((prev) => ({ ...prev, ...Object.fromEntries(expandKeys.map((key) => [key, true])) }))
    navigate(next)
  }

  // Opening a work from the home page also opens it in the sidebar.
  const openWork = (workId) => {
    setExpanded((prev) => ({ ...prev, [`work:${workId}`]: true }))
    navigate({ kind: 'work', id: workId })
  }

  // Opening a scene from the chapter overview also opens its work and
  // chapter in the sidebar, so the scene shows there as selected.
  const openScene = (sceneId, chapterId, workId) => {
    setExpanded((prev) => ({
      ...prev,
      [`work:${workId}`]: true,
      [`chapters:${workId}`]: true,
      [`chapter:${chapterId}`]: true
    }))
    navigate({ kind: 'scene', id: sceneId })
  }

  // Flipping to another scene's prose opens its chapter in the sidebar,
  // so the scene shows there as selected.
  const openSceneProse = (sceneId, chapterId) => {
    setExpanded((prev) => ({ ...prev, [`chapter:${chapterId}`]: true }))
    navigate({ kind: 'scene', id: sceneId, view: 'prose' })
  }

  // Opening a chapter from the work overview also opens its work in the
  // sidebar, so the chapter shows there as selected.
  const openChapter = (chapterId, workId) => {
    setExpanded((prev) => ({ ...prev, [`work:${workId}`]: true, [`chapters:${workId}`]: true }))
    navigate({ kind: 'chapter', id: chapterId })
  }

  // Opening a character (from search or the breadcrumb) also opens their
  // work and its Characters group in the sidebar.
  const openCharacter = (characterId, workId) => {
    setExpanded((prev) => ({ ...prev, [`work:${workId}`]: true, [`characters:${workId}`]: true }))
    navigate({ kind: 'character', id: characterId })
  }

  // After deleting a character, their profile is gone: show their work,
  // and forget the profile in history so Back can't return to it.
  const characterDeleted = (character) => {
    changed()
    setNav((prev) => ({
      selection: { kind: 'work', id: character.work.id },
      history: prev.history.filter((s) => !(s.kind === 'character' && s.id === character.id))
    }))
  }

  return (
    <div className="layout" style={{ '--sidebar-width': `${sidebarWidth}px` }}>
      <Sidebar
        selection={selection}
        onSelect={navigate}
        isExpanded={isExpanded}
        onToggle={toggle}
        refreshKey={libraryVersion}
        onImported={showImport}
        onCreated={openCreated}
      />
      <SidebarHandle width={sidebarWidth} onResize={setSidebarWidth} />
      <main className="main-pane" ref={mainPane}>
        <NavBar
          selection={selection}
          canGoBack={history.length > 0}
          onBack={goBack}
          refreshKey={libraryVersion}
          onOpenHome={() => navigate(HOME)}
          onOpenWork={openWork}
          onOpenChapter={openChapter}
          onOpenScene={openScene}
          onOpenCharacter={openCharacter}
        />
        <div className={`sheet sheet-${sheetKind(selection)}`}>
          {selection.kind === 'home' && <HomePage refreshKey={libraryVersion} onOpenWork={openWork} />}
          {selection.kind === 'work' && (
            <WorkOverview
              workId={selection.id}
              refreshKey={libraryVersion}
              onChanged={changed}
              onOpenChapter={openChapter}
            />
          )}
          {selection.kind === 'import' && <ImportReport report={selection.report} />}
          {selection.kind === 'character' && (
            <CharacterProfile
              characterId={selection.id}
              refreshKey={libraryVersion}
              onChanged={changed}
              onDeleted={characterDeleted}
              onDirtyChange={setUnsaved}
            />
          )}
          {selection.kind === 'chapter' && selection.view !== 'prose' && (
            <ChapterOverview
              chapterId={selection.id}
              refreshKey={libraryVersion}
              onChanged={changed}
              onOpenScene={openScene}
              onOpenProse={() => navigate({ kind: 'chapter', id: selection.id, view: 'prose' })}
            />
          )}
          {selection.kind === 'chapter' && selection.view === 'prose' && (
            <ChapterProse
              chapterId={selection.id}
              onBack={() => backTo({ kind: 'chapter', id: selection.id })}
              onOpenScene={openScene}
              onOpenChapter={(chapter) => navigate({ kind: 'chapter', id: chapter.id, view: 'prose' })}
            />
          )}
          {selection.kind === 'scene' && selection.view !== 'prose' && selection.view !== 'edit' && (
            <SceneDetail
              sceneId={selection.id}
              refreshKey={libraryVersion}
              onChanged={changed}
              onOpenProse={() => navigate({ kind: 'scene', id: selection.id, view: 'prose' })}
              onEditProse={() => navigate({ kind: 'scene', id: selection.id, view: 'edit' })}
            />
          )}
          {selection.kind === 'scene' && selection.view === 'prose' && (
            <ProseViewer
              sceneId={selection.id}
              onBack={() => backTo({ kind: 'scene', id: selection.id })}
              onOpenScene={(scene) => openSceneProse(scene.id, scene.chapterId)}
              onEditProse={() => navigate({ kind: 'scene', id: selection.id, view: 'edit' })}
            />
          )}
          {selection.kind === 'scene' && selection.view === 'edit' && (
            <ProseEditor
              sceneId={selection.id}
              onBack={() => backTo({ kind: 'scene', id: selection.id, view: 'prose' })}
              onDirtyChange={setUnsaved}
              onSaved={changed}
            />
          )}
        </div>
      </main>
    </div>
  )
}
