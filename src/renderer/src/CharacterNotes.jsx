import { useEffect, useRef, useState } from 'react'
import { useQuery } from './useQuery.js'
import { QueryError } from './QueryError.jsx'
import { SaveError } from './editing.jsx'
import { createProseEditor } from './proseEditor.js'
import { Toolbar, mod } from './ProseEditor.jsx'

// A character's freeform notes, on their profile (spec: Character
// profile). They live in the character's markdown file, and are edited
// with the scene editor's markdown editing and toolbar, without its
// paragraph numbers, wordcount or edit notes. Saving is explicit and
// guarded as a scene save is: the main process refuses if the file
// changed on disk since it was opened.
//
// onDirtyChange(dirty) tells App whether there are unsaved notes, so
// leaving the profile can ask first.

function Editor({ notes, characterName, onDirtyChange }) {
  const host = useRef(null)
  const viewRef = useRef(null)
  const saved = useRef({ text: notes.text, hash: notes.hash })
  const [text, setText] = useState(notes.text)
  const [status, setStatus] = useState({ saving: false, error: null, savedAt: null })
  const dirty = text !== saved.current.text

  async function save() {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === saved.current.text) return
    setStatus((s) => ({ ...s, saving: true, error: null }))
    try {
      const result = await window.ficBible.saveCharacterNotes(notes.id, current, saved.current.hash)
      if (!result.ok) {
        setStatus((s) => ({ ...s, saving: false, error: result.error }))
        return
      }
      saved.current = { text: current, hash: result.data.hash }
      setText(view.state.doc.toString())
      setStatus({ saving: false, error: null, savedAt: new Date() })
    } catch (e) {
      setStatus((s) => ({ ...s, saving: false, error: String(e?.message ?? e) }))
    }
  }
  const saveRef = useRef(save)
  saveRef.current = save

  useEffect(() => {
    const view = createProseEditor({
      parent: host.current,
      text: notes.text,
      onChange: setText,
      onSave: () => saveRef.current(),
      label: `Notes on ${characterName}`
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // One editor per character: the parent keys this by character id.
  }, [])

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty])
  useEffect(() => () => onDirtyChange(false), [])

  useEffect(() => {
    if (!dirty) return
    const refuse = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', refuse)
    return () => window.removeEventListener('beforeunload', refuse)
  }, [dirty])

  const state = status.saving
    ? 'Saving…'
    : dirty
      ? 'Unsaved changes'
      : status.savedAt
        ? `Saved at ${status.savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
        : 'No changes'

  return (
    <>
      <div className="editor-bar">
        <Toolbar viewRef={viewRef} />
        <div className="editor-save">
          <span className={dirty ? 'editor-state editor-state-dirty' : 'editor-state muted'} aria-live="polite">
            {state}
          </span>
          <button
            type="button"
            className="button-primary"
            disabled={!dirty || status.saving}
            title={`Save notes (${mod}S)`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={save}
          >
            Save
          </button>
        </div>
      </div>
      <SaveError error={status.error} />
      <div className="editor-host" ref={host} title={notes.path} />
    </>
  )
}

export default function CharacterNotes({ characterId, characterName, onDirtyChange }) {
  const result = useQuery(() => window.ficBible.characterNotes(characterId), characterId)

  let body
  if (result.loading) body = <p className="muted">Loading…</p>
  else if (result.ok === false) body = <QueryError what="the notes" error={result.error} />
  else if (result.data === null) body = <p className="muted">Character not found.</p>
  else if (result.data.fileError !== null) {
    const what = result.data.fileError === 'ENOENT' ? 'The notes file is missing' : "The notes file can't be edited"
    body = (
      <p className="file-error" title={result.data.path}>
        {what} ({result.data.fileError}).
      </p>
    )
  } else
    body = <Editor key={characterId} notes={result.data} characterName={characterName} onDirtyChange={onDirtyChange} />

  return (
    <section aria-label="Notes" className="character-notes">
      <h2>Notes</h2>
      {body}
    </section>
  )
}
