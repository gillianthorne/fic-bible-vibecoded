import { useState } from 'react'
import Sidebar from './Sidebar.jsx'
import HomePage from './HomePage.jsx'
import NavBar from './NavBar.jsx'
import WorkOverview from './WorkOverview.jsx'
import ChapterOverview from './ChapterOverview.jsx'
import SceneDetail from './SceneDetail.jsx'
import ProseViewer from './ProseViewer.jsx'
import ImportReport from './ImportReport.jsx'
import SidebarHandle, { useSidebarWidth } from './SidebarHandle.jsx'

// Each screen sits on a sheet of paper; the kind sets how wide it may grow.
function sheetKind(selection) {
  if (selection.kind === 'scene') return selection.view === 'prose' ? 'prose' : 'scene'
  return selection.kind
}

const HOME = { kind: 'home' }

const sameScreen = (a, b) => a.kind === b.kind && a.id === b.id && a.view === b.view

// selection is { kind: 'home' }, { kind: 'work', id }, { kind: 'chapter', id },
// { kind: 'scene', id, view }
// or { kind: 'import', report } for the result of the last import.
// view is 'prose' for the prose viewer; anything else is scene detail. The
// sidebar selects with no view, so a sidebar click always opens detail.
//
// history is the screens opened before this one, oldest first, for the
// back button. Every way of opening a screen goes through navigate(), so
// back works the same from the sidebar, the breadcrumb or a table row.
// Like expanded, it lasts as long as the app is open, and no longer.
//
// expanded holds only the sidebar rows the user has toggled, keyed
// 'work:<id>' or 'chapter:<id>'. Anything not in it uses the default:
// works open, chapters closed. It lives here rather than in the sidebar so
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

  // Opening the screen that's already open adds nothing to history.
  const navigate = (next) =>
    setNav((prev) =>
      sameScreen(prev.selection, next) ? prev : { selection: next, history: [...prev.history, prev.selection] }
    )

  const goBack = () =>
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
    if (report.cleared > 0) setNav({ selection: next, history: [] })
    else navigate(next)
  }

  const isExpanded = (key) => expanded[key] ?? key.startsWith('work:')
  const toggle = (key) => setExpanded((prev) => ({ ...prev, [key]: !(prev[key] ?? key.startsWith('work:')) }))

  // Opening a work from the home page also opens it in the sidebar.
  const openWork = (workId) => {
    setExpanded((prev) => ({ ...prev, [`work:${workId}`]: true }))
    navigate({ kind: 'work', id: workId })
  }

  // Opening a scene from the chapter overview also opens its work and
  // chapter in the sidebar, so the scene shows there as selected.
  const openScene = (sceneId, chapterId, workId) => {
    setExpanded((prev) => ({ ...prev, [`work:${workId}`]: true, [`chapter:${chapterId}`]: true }))
    navigate({ kind: 'scene', id: sceneId })
  }

  // Opening a chapter from the work overview also opens its work in the
  // sidebar, so the chapter shows there as selected.
  const openChapter = (chapterId, workId) => {
    setExpanded((prev) => ({ ...prev, [`work:${workId}`]: true }))
    navigate({ kind: 'chapter', id: chapterId })
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
      />
      <SidebarHandle width={sidebarWidth} onResize={setSidebarWidth} />
      <main className="main-pane">
        <NavBar
          selection={selection}
          canGoBack={history.length > 0}
          onBack={goBack}
          refreshKey={libraryVersion}
          onOpenHome={() => navigate(HOME)}
          onOpenWork={openWork}
          onOpenChapter={openChapter}
          onOpenScene={openScene}
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
          {selection.kind === 'chapter' && (
            <ChapterOverview
              chapterId={selection.id}
              refreshKey={libraryVersion}
              onChanged={changed}
              onOpenScene={openScene}
            />
          )}
          {selection.kind === 'scene' && selection.view !== 'prose' && (
            <SceneDetail
              sceneId={selection.id}
              refreshKey={libraryVersion}
              onChanged={changed}
              onOpenProse={() => navigate({ kind: 'scene', id: selection.id, view: 'prose' })}
            />
          )}
          {selection.kind === 'scene' && selection.view === 'prose' && (
            <ProseViewer sceneId={selection.id} onBack={() => backTo({ kind: 'scene', id: selection.id })} />
          )}
        </div>
      </main>
    </div>
  )
}
