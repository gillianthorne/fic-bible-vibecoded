import { useState } from 'react'
import { splitLinks } from './links.js'
import { EditButton, Field, FormActions, SaveError, useSave } from './editing.jsx'

// Notes on a work, chapter or scene: plain multi-line text, written here.
// They describe the prose and never hold it. Any http(s) URL in them is a
// link that opens in the default browser.

// A link handed to the main process, which checks it and passes it to the
// default browser. The click never navigates the app's own window.
export function ExternalLink({ href, children }) {
  const [error, setError] = useState(null)
  async function open(e) {
    e.preventDefault()
    setError(null)
    const result = await window.ficBible.openLink(href)
    if (!result.ok) setError(result.error)
  }
  return (
    <>
      <a className="external-link" href={href} onClick={open} title={`Open ${href} in your browser`}>
        {children ?? href}
      </a>
      {error && (
        <span className="save-error" role="alert">
          {' '}
          {error}
        </span>
      )}
    </>
  )
}

function NotesText({ text }) {
  return (
    <div className="notes-text">
      {splitLinks(text).map((part, i) =>
        part.type === 'link' ? <ExternalLink key={i} href={part.text} /> : <span key={i}>{part.text}</span>
      )}
    </div>
  )
}

// notes is the stored text or null. saveNotes(text) returns the IPC
// result; onChanged() runs after a successful save. what names the row
// ("scene") for the empty state and the edit button.
export default function Notes({ notes, what, saveNotes, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(notes ?? '')
  const { busy, error, save } = useSave()

  function submit(e) {
    e.preventDefault()
    save(
      () => saveNotes(text),
      () => {
        setEditing(false)
        onChanged()
      }
    )
  }

  return (
    <section className="notes" aria-label="Notes">
      <div className="title-row">
        <h2>Notes</h2>
        {!editing && (
          <EditButton
            label={`Edit ${what} notes`}
            onClick={() => {
              setText(notes ?? '')
              setEditing(true)
            }}
          />
        )}
      </div>
      {editing ? (
        <form className="edit-form notes-form" onSubmit={submit}>
          <Field label="Notes" wide>
            {(id) => <textarea id={id} rows={6} value={text} autoFocus onChange={(e) => setText(e.target.value)} />}
          </Field>
          <p className="muted edit-note">Links starting http:// or https:// open in your browser.</p>
          <SaveError error={error} />
          <FormActions busy={busy} onCancel={() => setEditing(false)} />
        </form>
      ) : notes ? (
        <NotesText text={notes} />
      ) : (
        <p className="muted">No notes for this {what}.</p>
      )}
    </section>
  )
}
