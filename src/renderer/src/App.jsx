import { useState } from 'react'
import Sidebar from './Sidebar.jsx'
import ChapterOverview from './ChapterOverview.jsx'

export default function App() {
  const [chapterId, setChapterId] = useState(null)

  return (
    <div className="layout">
      <Sidebar selectedChapterId={chapterId} onSelectChapter={setChapterId} />
      <main className="main-pane">
        {chapterId === null ? (
          <p className="muted">Pick a chapter from the sidebar.</p>
        ) : (
          <ChapterOverview chapterId={chapterId} />
        )}
      </main>
    </div>
  )
}
