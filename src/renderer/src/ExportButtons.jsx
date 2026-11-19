import { useEffect, useRef, useState } from 'react'

// An Export button, on the chapter overview and the chapter prose page,
// opening a menu of formats. Picking one asks where to save, then says
// where it went or why it didn't. A new format is one more entry here
// (and in FORMATS in src/main/export.js).
const FORMATS = [
  { format: 'html', label: 'HTML', hint: 'for posting on AO3' },
  { format: 'md', label: 'Markdown', hint: 'for editors' }
]

export default function ExportButtons({ chapterId }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)

  // Closes on a click anywhere else, or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => ref.current?.contains(e.target) || setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function run(format) {
    setOpen(false)
    setBusy(true)
    setStatus(null)
    const result = await window.ficBible.exportChapter(chapterId, format)
    setBusy(false)
    if (result.ok === false) setStatus({ error: result.error })
    else if (result.data) setStatus({ saved: result.data })
  }

  return (
    <div className="chapter-export" ref={ref}>
      <button
        type="button"
        className="export-toggle"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
      >
        {busy ? 'Exporting…' : 'Export'} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul className="export-menu" role="menu">
          {FORMATS.map(({ format, label, hint }) => (
            <li key={format} role="none">
              <button type="button" role="menuitem" onClick={() => run(format)}>
                <strong>{label}</strong> <span className="muted">· {hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {status?.saved && <p className="muted">Saved to {status.saved}</p>}
      {status?.error && <p className="file-error">{status.error}</p>}
    </div>
  )
}
