import { useEffect, useRef, useState } from 'react'
import { EditButton, SaveError } from './editing.jsx'
import { createProseEditor } from './proseEditor.js'
import { Toolbar, mod } from './ProseEditor.jsx'
import Markdown from './Markdown.jsx'
import { splitParagraphs } from '../../main/prose.js'

// A markdown file shown read and edited in place: a character's notes or
// a note page. It opens read, styled as it would read with the markers
// hidden; the pencil opens the prose editor's markdown editing and
// toolbar, without its paragraph numbers, wordcount or edit notes.
//
// Saving is explicit. The Save button saves and goes back to reading;
// Ctrl-S saves and stays in the editor. Close goes back without saving,
// asking first if there are unsaved changes. save(text, baseHash) resolves
// to { ok, data: { hash, written } } or { ok, error }, and the main
// process refuses if the file changed on disk since it was opened (spec:
// File handling); a refused save stays in the editor.
//
// file is { text, hash, path }. label is the text area's accessible name,
// and names what the pencil edits. onDirtyChange(dirty) tells App whether
// there are unsaved changes, so leaving the screen can ask first.

export default function MarkdownFileEditor({ file, save: saveFile, label, onDirtyChange }) {
  const host = useRef(null)
  const viewRef = useRef(null)
  const saved = useRef({ text: file.text, hash: file.hash })
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(file.text)
  const [status, setStatus] = useState({ saving: false, error: null, savedAt: null })
  const dirty = text !== saved.current.text

  // Resolves to whether the editor's text is now saved.
  async function save() {
    const view = viewRef.current
    if (!view) return false
    const current = view.state.doc.toString()
    if (current === saved.current.text) return true
    setStatus((s) => ({ ...s, saving: true, error: null }))
    try {
      const result = await saveFile(current, saved.current.hash)
      if (!result.ok) {
        setStatus((s) => ({ ...s, saving: false, error: result.error }))
        return false
      }
      saved.current = { text: current, hash: result.data.hash }
      setText(view.state.doc.toString())
      setStatus({ saving: false, error: null, savedAt: new Date() })
      return true
    } catch (e) {
      setStatus((s) => ({ ...s, saving: false, error: String(e?.message ?? e) }))
      return false
    }
  }
  const saveRef = useRef(save)
  saveRef.current = save

  const saveAndClose = async () => {
    if (await save()) setEditing(false)
  }

  const close = () => {
    if (dirty && !window.confirm('Close without saving? Your unsaved changes will be lost.')) return
    setText(saved.current.text)
    setStatus({ saving: false, error: null, savedAt: null })
    setEditing(false)
  }

  // The editor exists only while editing, and starts from the saved text.
  useEffect(() => {
    if (!editing) return
    const view = createProseEditor({
      parent: host.current,
      text: saved.current.text,
      onChange: setText,
      onSave: () => saveRef.current(),
      label
    })
    viewRef.current = view
    view.focus()
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [editing])

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

  if (!editing) {
    const paragraphs = splitParagraphs(saved.current.text)
    return (
      <div className="notes-view" title={file.path}>
        <div className="notes-view-bar">
          <EditButton label={`Edit ${label}`} onClick={() => setEditing(true)} />
        </div>
        {paragraphs.length === 0 ? (
          <p className="muted">Nothing written yet.</p>
        ) : (
          <div className="prose">
            {paragraphs.map((paragraph, i) => (
              <div key={i} className="prose-text">
                <Markdown paragraph={paragraph} />
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

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
            title={`Save and close (${mod}S saves and keeps editing)`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={saveAndClose}
          >
            Save
          </button>
          <button type="button" disabled={status.saving} onClick={close}>
            Close
          </button>
        </div>
      </div>
      <SaveError error={status.error} />
      <div className="editor-host" ref={host} title={file.path} />
    </>
  )
}
