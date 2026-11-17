import { useEffect, useRef, useState } from 'react'
import { SaveError } from './editing.jsx'
import { createProseEditor } from './proseEditor.js'
import { Toolbar, mod } from './ProseEditor.jsx'

// A markdown file edited in place: a character's notes or a note page.
// The prose editor's markdown editing and toolbar, without its paragraph
// numbers, wordcount or edit notes. Saving is explicit; save(text,
// baseHash) resolves to { ok, data: { hash, written } } or { ok, error },
// and the main process refuses if the file changed on disk since it was
// opened (spec: File handling).
//
// file is { text, hash, path }. label is the text area's accessible name.
// onDirtyChange(dirty) tells App whether there are unsaved changes, so
// leaving the screen can ask first.

export default function MarkdownFileEditor({ file, save: saveFile, label, onDirtyChange }) {
  const host = useRef(null)
  const viewRef = useRef(null)
  const saved = useRef({ text: file.text, hash: file.hash })
  const [text, setText] = useState(file.text)
  const [status, setStatus] = useState({ saving: false, error: null, savedAt: null })
  const dirty = text !== saved.current.text

  async function save() {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === saved.current.text) return
    setStatus((s) => ({ ...s, saving: true, error: null }))
    try {
      const result = await saveFile(current, saved.current.hash)
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
      text: file.text,
      onChange: setText,
      onSave: () => saveRef.current(),
      label
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // One editor per file: the parent keys this by what it edits.
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
            title={`Save (${mod}S)`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={save}
          >
            Save
          </button>
        </div>
      </div>
      <SaveError error={status.error} />
      <div className="editor-host" ref={host} title={file.path} />
    </>
  )
}
