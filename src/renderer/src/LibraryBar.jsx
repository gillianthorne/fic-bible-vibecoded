import { useState } from 'react'
import { useQuery } from './useQuery.js'
import { QueryError } from './QueryError.jsx'

// Top of the sidebar: which library folder is open, and the two things
// that can be done to it. Choosing a folder saves it to config and imports
// it; Re-import picks up files added since. Both report back through
// onImported(report). Neither button is offered with a dev test library.
export default function LibraryBar({ refreshKey, onImported }) {
  const info = useQuery(() => window.ficBible.libraryInfo(), `library:${refreshKey}`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function run(call) {
    setBusy(true)
    setError(null)
    try {
      const result = await call()
      if (!result.ok) setError(result.error)
      else if (result.data) onImported(result.data)
    } catch (e) {
      setError(String(e?.message ?? e))
    } finally {
      setBusy(false)
    }
  }

  const isDefault = info.ok && info.data.source.startsWith('fallback')

  return (
    <section className="library-bar" aria-label="Library folder">
      <h2 className="library-label">Library</h2>
      {info.loading && <p className="muted">Loading…</p>}
      {info.ok === false && <QueryError what="the library folder" error={info.error} />}
      {info.ok && (
        <>
          <p className="library-path" title={info.data.libraryRoot}>
            {info.data.libraryRoot}
          </p>
          {isDefault && <p className="library-note muted">Default folder. Choose one to use your own.</p>}
          {!info.data.canChange && <p className="library-note muted">Test library (dev). Can’t be changed here.</p>}
          {info.data.canChange && (
            <div className="library-actions">
              <button type="button" disabled={busy} onClick={() => run(() => window.ficBible.chooseLibrary())}>
                Choose folder…
              </button>
              <button type="button" disabled={busy} onClick={() => run(() => window.ficBible.importLibrary())}>
                Re-import
              </button>
            </div>
          )}
          {busy && (
            <p className="library-note muted" role="status">
              Working…
            </p>
          )}
        </>
      )}
      {error && <QueryError what="the library" error={error} />}
    </section>
  )
}
