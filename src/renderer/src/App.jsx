import { useState } from 'react'
import Sidebar from './Sidebar.jsx'
import ChapterOverview from './ChapterOverview.jsx'
import SceneDetail from './SceneDetail.jsx'
import ProseViewer from './ProseViewer.jsx'
import ImportReport from './ImportReport.jsx'

// selection is null, { kind: 'chapter', id }, { kind: 'scene', id, view }
// or { kind: 'import', report } for the result of the last import.
// view is 'prose' for the prose viewer; anything else is scene detail. The
// sidebar selects with no view, so a sidebar click always opens detail.
//
// expanded holds only the sidebar rows the user has toggled, keyed
// 'work:<id>' or 'chapter:<id>'. Anything not in it uses the default:
// works open, chapters closed. It lives here rather than in the sidebar so
// it lasts as long as the app is open, and no longer.
export default function App() {
  const [selection, setSelection] = useState(null)
  const [expanded, setExpanded] = useState({})
  // Bumped after each import or edit so the sidebar and the open screen
  // read the library again.
  const [libraryVersion, setLibraryVersion] = useState(0)
  const changed = () => setLibraryVersion((v) => v + 1)

  // An import can clear works, so whatever was open may be gone: show the
  // report instead.
  const showImport = (report) => {
    setLibraryVersion((v) => v + 1)
    setSelection({ kind: 'import', report })
  }

  const isExpanded = (key) => expanded[key] ?? key.startsWith('work:')
  const toggle = (key) => setExpanded((prev) => ({ ...prev, [key]: !(prev[key] ?? key.startsWith('work:')) }))

  return (
    <div className="layout">
      <Sidebar
        selection={selection}
        onSelect={setSelection}
        isExpanded={isExpanded}
        onToggle={toggle}
        refreshKey={libraryVersion}
        onImported={showImport}
      />
      <main className="main-pane">
        {selection === null && <p className="muted">Pick a chapter or scene from the sidebar.</p>}
        {selection?.kind === 'import' && <ImportReport report={selection.report} />}
        {selection?.kind === 'chapter' && <ChapterOverview chapterId={selection.id} />}
        {selection?.kind === 'scene' && selection.view !== 'prose' && (
          <SceneDetail
            sceneId={selection.id}
            refreshKey={libraryVersion}
            onChanged={changed}
            onOpenProse={() => setSelection({ kind: 'scene', id: selection.id, view: 'prose' })}
          />
        )}
        {selection?.kind === 'scene' && selection.view === 'prose' && (
          <ProseViewer sceneId={selection.id} onBack={() => setSelection({ kind: 'scene', id: selection.id })} />
        )}
      </main>
    </div>
  )
}
