import { useEffect, useRef, useState } from 'react'
import { useQuery } from './useQuery.js'
import { QueryError } from './QueryError.jsx'
import { SaveError } from './editing.jsx'
import { number } from './labels.jsx'
import { commands, createProseEditor } from './proseEditor.js'
import { countProse } from '../../main/prose.js'

// Edits one scene's file (spec: Scene prose editor). The markdown source
// is shown with its marks, styled as it reads. Saving is explicit; the
// main process refuses a save if the file changed on disk since it was
// opened (spec: File handling).
//
// onDirtyChange(dirty) tells App whether there are unsaved changes, so
// leaving the screen can ask first. onSaved() is called after each save
// that wrote the file, so wordcounts elsewhere are read again.

const count = (n, noun) => `${number(n)} ${noun}${n === 1 ? '' : 's'}`

const isMac = navigator.platform.startsWith('Mac')
const mod = isMac ? '⌘' : 'Ctrl+'

// The toolbar: [command name, label, accessible name, class]
const TOOLS = [
  ['bold', 'B', `Bold (${mod}B)`, 'tool-bold'],
  ['italic', 'I', `Italic (${mod}I)`, 'tool-italic'],
  ['strikethrough', 'S', 'Strikethrough', 'tool-strike'],
  null,
  ['heading', 'H', 'Heading (cycles #, ##, ###, none)', 'tool-heading'],
  ['quote', '❝', 'Blockquote', null],
  ['bulletList', '•', 'Bulleted list', null],
  ['numberedList', '1.', 'Numbered list', null],
  null,
  ['sceneBreak', '* * *', 'Scene break', 'tool-break']
]

function Toolbar({ viewRef }) {
  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
      {TOOLS.map((tool, i) => {
        if (!tool) return <span key={i} className="editor-toolbar-gap" aria-hidden="true" />
        const [name, label, title, className] = tool
        return (
          <button
            key={name}
            type="button"
            className={className ?? undefined}
            title={title}
            aria-label={title}
            // Keep the editor's selection: a click would otherwise move
            // focus, and the selection with it, to the button.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const view = viewRef.current
              if (!view) return
              commands[name](view)
              view.focus()
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function Editor({ scene, onBack, onDirtyChange, onSaved }) {
  const host = useRef(null)
  const viewRef = useRef(null)
  // What's on disk, as far as the editor knows: the text last opened or
  // saved, and the hash the main process checks a save against.
  const saved = useRef({ text: scene.text, hash: scene.hash })
  const [text, setText] = useState(scene.text)
  const [status, setStatus] = useState({ saving: false, error: null, savedAt: null })
  const dirty = text !== saved.current.text

  async function save() {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === saved.current.text) return
    setStatus((s) => ({ ...s, saving: true, error: null }))
    try {
      const result = await window.ficBible.saveScene(scene.id, current, saved.current.hash)
      if (!result.ok) {
        setStatus((s) => ({ ...s, saving: false, error: result.error }))
        return
      }
      saved.current = { text: current, hash: result.data.hash }
      // Re-render so dirty is worked out against the new saved text.
      setText(view.state.doc.toString())
      setStatus({ saving: false, error: null, savedAt: new Date() })
      if (result.data.written) onSaved()
    } catch (e) {
      setStatus((s) => ({ ...s, saving: false, error: String(e?.message ?? e) }))
    }
  }
  // The keymap holds on to the first render's function; this keeps it
  // calling the current one.
  const saveRef = useRef(save)
  saveRef.current = save

  useEffect(() => {
    const view = createProseEditor({
      parent: host.current,
      text: scene.text,
      onChange: setText,
      onSave: () => saveRef.current()
    })
    viewRef.current = view
    view.focus()
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // One editor per scene: the parent keys this component by scene id.
  }, [])

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty])
  useEffect(() => () => onDirtyChange(false), [])

  // Closing or reloading the window with unsaved changes: the main
  // process sees the unload refused and asks.
  useEffect(() => {
    if (!dirty) return
    const refuse = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', refuse)
    return () => window.removeEventListener('beforeunload', refuse)
  }, [dirty])

  const counts = countProse(text)
  const state = status.saving
    ? 'Saving…'
    : dirty
      ? 'Unsaved changes'
      : status.savedAt
        ? `Saved at ${status.savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
        : 'No changes'

  return (
    <article className="prose-viewer prose-editor">
      <header>
        <button type="button" className="link-button" onClick={onBack}>
          ← Back to prose
        </button>
        <p className="muted">
          {scene.work.title} · Chapter {scene.chapter.number}: {scene.chapter.title}
        </p>
        <h1>{scene.title}</h1>
        <p className="muted">
          {count(counts.paragraphs, 'paragraph')} · {count(counts.words, 'word')}
        </p>
      </header>

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

      <div className="editor-host" ref={host} title={scene.path} />
    </article>
  )
}

export default function ProseEditor({ sceneId, onBack, onDirtyChange, onSaved }) {
  const result = useQuery(() => window.ficBible.sceneSource(sceneId), sceneId)

  const back = (
    <button type="button" className="link-button" onClick={onBack}>
      ← Back to prose
    </button>
  )

  if (result.loading) return <p className="muted">Loading…</p>
  if (result.ok === false)
    return (
      <>
        {back}
        <QueryError what="this scene's prose" error={result.error} />
      </>
    )
  if (result.data === null) return <p className="muted">Scene not found.</p>

  const scene = result.data
  if (scene.fileError !== null) {
    const what = scene.fileError === 'ENOENT' ? 'The scene file is missing' : "The scene file can't be edited"
    return (
      <>
        {back}
        <p className="file-error" title={scene.path}>
          {what} ({scene.fileError}).
        </p>
      </>
    )
  }

  return <Editor key={scene.id} scene={scene} onBack={onBack} onDirtyChange={onDirtyChange} onSaved={onSaved} />
}
