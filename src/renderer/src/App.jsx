import { useState } from 'react'
import Sidebar from './Sidebar.jsx'
import ChapterOverview from './ChapterOverview.jsx'
import SceneDetail from './SceneDetail.jsx'

// selection is null, { kind: 'chapter', id } or { kind: 'scene', id }.
//
// expanded holds only the sidebar rows the user has toggled, keyed
// 'work:<id>' or 'chapter:<id>'. Anything not in it uses the default:
// works open, chapters closed. It lives here rather than in the sidebar so
// it lasts as long as the app is open, and no longer.
export default function App() {
  const [selection, setSelection] = useState(null)
  const [expanded, setExpanded] = useState({})

  const isExpanded = (key) => expanded[key] ?? key.startsWith('work:')
  const toggle = (key) => setExpanded((prev) => ({ ...prev, [key]: !(prev[key] ?? key.startsWith('work:')) }))

  return (
    <div className="layout">
      <Sidebar selection={selection} onSelect={setSelection} isExpanded={isExpanded} onToggle={toggle} />
      <main className="main-pane">
        {selection === null && <p className="muted">Pick a chapter or scene from the sidebar.</p>}
        {selection?.kind === 'chapter' && <ChapterOverview chapterId={selection.id} />}
        {selection?.kind === 'scene' && <SceneDetail sceneId={selection.id} />}
      </main>
    </div>
  )
}
