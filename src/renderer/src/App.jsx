import { useState } from 'react'
import Sidebar from './Sidebar.jsx'
import ChapterOverview from './ChapterOverview.jsx'
import SceneDetail from './SceneDetail.jsx'

// selection is null, { kind: 'chapter', id } or { kind: 'scene', id }.
export default function App() {
  const [selection, setSelection] = useState(null)

  return (
    <div className="layout">
      <Sidebar selection={selection} onSelect={setSelection} />
      <main className="main-pane">
        {selection === null && <p className="muted">Pick a chapter or scene from the sidebar.</p>}
        {selection?.kind === 'chapter' && <ChapterOverview chapterId={selection.id} />}
        {selection?.kind === 'scene' && <SceneDetail sceneId={selection.id} />}
      </main>
    </div>
  )
}
