import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from './useQuery.js'
import { QueryError } from './QueryError.jsx'
import { SaveError, useSuggestions } from './editing.jsx'
import { number } from './labels.jsx'
import { commands, createProseEditor, goToParagraph, setNoteCounts } from './proseEditor.js'
import { countProse } from '../../main/prose.js'
import { NoteParagraph, NotePopup, NoteStatus, openCount } from './EditNotes.jsx'

// Moves the cursor to a note's paragraph, then makes sure that line isn't
// hidden under what's pinned at the top of the pane: the toolbar, and the
// notes panel too when it sits above the text (a narrow editor) rather
// than beside it. Measured after CodeMirror has scrolled, once the pinned
// pieces have settled where they stick.
function jumpToNote(view, paragraph, panel) {
  if (!goToParagraph(view, paragraph)) return
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const pane = document.querySelector('.main-pane')
      const line = view.coordsAtPos(view.state.selection.main.head)
      const stacked = getComputedStyle(panel).order === '-1'
      const cover = stacked ? panel : document.querySelector('.editor-bar')
      if (!pane || !line || !cover) return
      const hidden = cover.getBoundingClientRect().bottom + 16 - line.top
      if (hidden > 0) pane.scrollBy(0, -hidden)
    })
  )
}

// The scene's edit notes beside the editor (spec: Scene prose editor).
// Clicking a note moves the cursor to its paragraph, counted in the text
// as it is now; setting a status saves that row straight away. Neither
// touches the prose, so neither is an unsaved change. It always starts
// collapsed: the editor is remounted for each scene, so this does too.
function NotesPanel({ result, onChanged, viewRef, paragraphs }) {
  const [showAll, setShowAll] = useState(false)
  const [collapsed, setCollapsed] = useState(true)

  let body
  if (result.loading) body = <p className="muted">Loading…</p>
  else if (result.ok === false) body = <QueryError what="the edit notes" error={result.error} />
  else if (result.data.length === 0)
    body = <p className="muted">No edit notes. Add them from View prose, by clicking a paragraph number.</p>
  else {
    const notes = showAll ? result.data : result.data.filter((n) => n.status === 'open')
    const hidden = result.data.length - openCount(result.data)
    body = (
      <>
        {notes.length === 0 && <p className="muted">Every note has been dealt with.</p>}
        <ul className="editor-notes-list">
          {notes.map((note) => (
            <li key={note.id} className={`editor-note edit-note-${note.status}`}>
              <button
                type="button"
                className="editor-note-jump"
                title={`Go to paragraph ${note.paragraph}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) =>
                  viewRef.current && jumpToNote(viewRef.current, note.paragraph, e.currentTarget.closest('.editor-notes'))
                }
              >
                <span className="editor-note-meta">
                  <NoteParagraph value={note.paragraph} paragraphs={paragraphs} />
                  {note.kind && <span className="edit-note-kind"> · {note.kind}</span>}
                </span>
                <span className="edit-note-text">{note.note}</span>
              </button>
              <NoteStatus note={note} onChanged={onChanged} label={`Status of the note at paragraph ${note.paragraph}`} />
            </li>
          ))}
        </ul>
        {hidden > 0 && (
          <button type="button" className="link-button editor-notes-toggle" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show open notes only' : `Show ${hidden} dealt with`}
          </button>
        )}
      </>
    )
  }

  const open = result.ok ? openCount(result.data) : null
  return (
    <aside className={`editor-notes${collapsed ? ' editor-notes-collapsed' : ''}`} aria-label="Edit notes">
      <h2>
        <button
          type="button"
          className="editor-notes-heading"
          aria-expanded={!collapsed}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setCollapsed(!collapsed)}
        >
          <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span> Edit notes
          {open ? <span className="prose-note-count">{open}</span> : null}
        </button>
      </h2>
      {!collapsed && body}
    </aside>
  )
}

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

  // Edit notes: read here, shared by the panel, the counts in the margin
  // and the popup a count opens. A change to any of them reads them again.
  const [notesVersion, setNotesVersion] = useState(0)
  const notes = useQuery(() => window.ficBible.editNotes(scene.id), scene.id, notesVersion)
  const notesChanged = () => setNotesVersion((v) => v + 1)
  const { editKinds } = useSuggestions(notesVersion)
  const [popup, setPopup] = useState(null) // { paragraph, top, left } | null
  const layout = useRef(null)
  const closePopup = useCallback(() => setPopup(null), [])

  // A count in the margin opens its paragraph's notes beside it; a
  // paragraph number opens them ready to add one. Clicking the same thing
  // again closes them. Placed just right of the margin, clear of both.
  const openPopup = (paragraph, anchor, adding) => {
    const frame = layout.current.getBoundingClientRect()
    const at = (anchor.closest('.cm-gutterElement') ?? anchor).getBoundingClientRect()
    setPopup((open) =>
      open?.paragraph === paragraph && open.adding === adding
        ? null
        : { paragraph, adding, top: at.top - frame.top - 8, left: at.right - frame.left + 6 }
    )
  }
  const openPopupRef = useRef(openPopup)
  openPopupRef.current = openPopup

  useEffect(() => {
    const view = viewRef.current
    if (!view || !notes.ok) return
    const counts = new Map()
    for (const note of notes.data) {
      if (note.status === 'open') counts.set(note.paragraph, (counts.get(note.paragraph) ?? 0) + 1)
    }
    view.dispatch({ effects: setNoteCounts.of(counts) })
  }, [notes])

  useEffect(() => {
    const view = createProseEditor({
      parent: host.current,
      text: scene.text,
      onChange: setText,
      onSave: () => saveRef.current(),
      onNotes: (paragraph, anchor, adding) => openPopupRef.current(paragraph, anchor, adding)
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

      <div className="editor-layout" ref={layout}>
        <div className="editor-host" ref={host} title={scene.path} />
        <NotesPanel result={notes} onChanged={notesChanged} viewRef={viewRef} paragraphs={counts.paragraphs} />
        {popup && (
          <NotePopup
            key={`${popup.paragraph}-${popup.adding}`}
            sceneId={scene.id}
            popup={popup}
            notes={notes.ok ? notes.data.filter((n) => n.paragraph === popup.paragraph) : []}
            editKinds={editKinds}
            paragraphs={counts.paragraphs}
            onChanged={notesChanged}
            onClose={closePopup}
          />
        )}
      </div>
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
