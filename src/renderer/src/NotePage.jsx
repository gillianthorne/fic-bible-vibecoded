import { useState } from 'react'
import { useQuery } from './useQuery.js'
import { QueryError } from './QueryError.jsx'
import { DeleteButton, EditButton, FormActions, SaveError, useSave } from './editing.jsx'
import MarkdownFileEditor from './MarkdownFileEditor.jsx'

// One freeform note page (spec: Note pages): its name, which can be
// changed (the file keeps its own name), and its markdown file in the
// editor. Nothing about what's written is structured; it's the author's.

function Title({ page, onChanged, onDeleted }) {
  const [mode, setMode] = useState('view') // 'view' | 'rename' | 'confirm-delete'
  const [name, setName] = useState(page.name)
  const { busy, error, save, clearError } = useSave()

  if (mode === 'rename') {
    return (
      <form
        className="edit-form"
        onSubmit={(e) => {
          e.preventDefault()
          save(
            () => window.ficBible.renameNotePage(page.id, name),
            () => {
              setMode('view')
              onChanged()
            }
          )
        }}
      >
        <input type="text" aria-label="Page name" value={name} required autoFocus onChange={(e) => setName(e.target.value)} />
        <p className="muted edit-note">File: {page.filename} (the app doesn’t rename files)</p>
        <SaveError error={error} />
        <FormActions
          busy={busy}
          onCancel={() => {
            clearError()
            setName(page.name)
            setMode('view')
          }}
        />
      </form>
    )
  }

  return (
    <>
      <div className="title-row">
        <h1>{page.name}</h1>
        <EditButton label="Rename page" onClick={() => setMode('rename')} />
        <DeleteButton label="Delete page" onClick={() => setMode('confirm-delete')} />
        <span className="beat-tools page-order">
          <button
            type="button"
            title="Move up in the list"
            aria-label="Move page up in the list"
            disabled={busy}
            onClick={() => save(() => window.ficBible.moveNotePage(page.id, 'up'), onChanged)}
          >
            ↑
          </button>
          <button
            type="button"
            title="Move down in the list"
            aria-label="Move page down in the list"
            disabled={busy}
            onClick={() => save(() => window.ficBible.moveNotePage(page.id, 'down'), onChanged)}
          >
            ↓
          </button>
        </span>
      </div>
      {mode === 'confirm-delete' && (
        <div className="beat-confirm" role="alert">
          <span>Remove “{page.name}” from the list? Its file, {page.filename}, stays on disk.</span>
          <button
            type="button"
            className="button-danger"
            disabled={busy}
            onClick={() => save(() => window.ficBible.deleteNotePage(page.id), onDeleted)}
          >
            Remove
          </button>
          <button type="button" disabled={busy} onClick={() => setMode('view')}>
            Cancel
          </button>
        </div>
      )}
      <SaveError error={error} />
    </>
  )
}

// refreshKey re-reads the page's name after a rename without reopening
// the file, so unsaved text in the editor is kept.
export default function NotePage({ pageId, refreshKey, onChanged, onDeleted, onDirtyChange }) {
  const meta = useQuery(() => window.ficBible.notePage(pageId), `meta:${pageId}`, refreshKey)
  const file = useQuery(() => window.ficBible.notePage(pageId), `file:${pageId}`)

  if (meta.loading || file.loading) return <p className="muted">Loading…</p>
  const failed = meta.ok === false ? meta : file.ok === false ? file : null
  if (failed) return <QueryError what="this page" error={failed.error} />
  if (meta.data === null) return <p className="muted">Page not found.</p>

  const page = meta.data
  return (
    <article className="scene-detail note-page character-notes">
      <header>
        <p className="muted">{page.work.title} · Notes</p>
        <Title key={`${page.id}:${page.name}`} page={page} onChanged={onChanged} onDeleted={() => onDeleted(page)} />
      </header>
      {file.data.fileError !== null ? (
        <p className="file-error" title={file.data.path}>
          {file.data.fileError === 'ENOENT' ? 'The page’s file is missing' : 'The page’s file can’t be edited'} (
          {file.data.fileError}).
        </p>
      ) : (
        <MarkdownFileEditor
          key={pageId}
          file={file.data}
          save={(text, hash) => window.ficBible.saveNotePage(pageId, text, hash)}
          label={page.name}
          onDirtyChange={onDirtyChange}
        />
      )}
    </article>
  )
}
