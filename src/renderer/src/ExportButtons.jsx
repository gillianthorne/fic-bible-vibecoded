import { useEffect, useRef, useState } from 'react'

// An Export button, at the top right of the chapter overview and the
// chapter prose page, opening a menu of formats. Picking one asks where to
// save, then says where it went or why it didn't, in a box under the
// button that a click anywhere else closes. A new format is one more entry here
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

  // The menu or the result box closes on a click anywhere else, or Escape.
  const shown = open || status !== null
  useEffect(() => {
    if (!shown) return
    const close = () => {
      setOpen(false)
      setStatus(null)
    }
    const onDown = (e) => ref.current?.contains(e.target) || close()
    const onKey = (e) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [shown])

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
        onClick={() => {
          setStatus(null)
          setOpen((o) => !o)
        }}
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
      {status && (
        <p className={status.error ? 'export-status file-error' : 'export-status'} role="status">
          {status.error ?? `Saved to ${status.saved}`}
        </p>
      )}
    </div>
  )
}
