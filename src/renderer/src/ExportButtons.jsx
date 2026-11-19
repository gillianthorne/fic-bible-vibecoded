import { useState } from 'react'

// Export .html (for AO3) and Export .md (for editors), on the chapter
// overview and the chapter prose page: each asks where to save, then says
// where it went or why it didn't.
export default function ExportButtons({ chapterId }) {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)

  async function run(format) {
    setBusy(true)
    setStatus(null)
    const result = await window.ficBible.exportChapter(chapterId, format)
    setBusy(false)
    if (result.ok === false) setStatus({ error: result.error })
    else if (result.data) setStatus({ saved: result.data })
  }

  return (
    <div className="prose-export">
      <span className="muted">Export:</span>
      <button type="button" className="link-button" disabled={busy} onClick={() => run('html')}>
        .html
      </button>
      <button type="button" className="link-button" disabled={busy} onClick={() => run('md')}>
        .md
      </button>
      {status?.saved && <p className="muted">Saved to {status.saved}</p>}
      {status?.error && <p className="file-error">{status.error}</p>}
    </div>
  )
}
