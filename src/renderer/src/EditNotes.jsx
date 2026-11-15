import { useEffect, useRef, useState } from 'react'
import {
  DeleteButton,
  EDIT_NOTE_STATUSES,
  EditButton,
  Field,
  FormActions,
  NumberInput,
  SaveError,
  Select,
  SuggestInput,
  toNumber,
  useSave
} from './editing.jsx'

// Edit notes: per-paragraph corrections and notes for revising (spec:
// Scene detail, Scene prose viewer, Scene prose editor). Every change is
// a database row, saved straight away; the scene file is never touched.
// onChanged() makes the screen read the notes again, so what's shown is
// what's stored.

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export const openCount = (notes) => notes.filter((n) => n.status === 'open').length

// How many of these notes have each status, as [status, count] pairs in
// the order open, fixed, ignored, cut, leaving out statuses with none.
export function statusCounts(notes) {
  return EDIT_NOTE_STATUSES.map((s) => [s, notes.filter((n) => n.status === s).length]).filter(([, n]) => n > 0)
}

// Describes the counts in words, for a tooltip or accessible name:
// "2 open, 1 fixed".
export const describeCounts = (counts) => counts.map(([s, n]) => `${n} ${s}`).join(', ')

// The counts before a paragraph number in the prose viewer: a small
// numbered badge per status, as one button that opens the paragraph's
// notes. (The editor's margin builds the same thing in proseEditor.js.)
export function NoteCounts({ paragraph, notes, onOpen }) {
  const counts = statusCounts(notes)
  if (counts.length === 0) return null
  const words = `${describeCounts(counts)} edit note${notes.length === 1 ? '' : 's'}`
  return (
    <button
      type="button"
      className="note-counts"
      data-note-anchor=""
      title={`${words}: click to view`}
      aria-label={`Paragraph ${paragraph}: ${words}, view`}
      onClick={(e) => onOpen(e.currentTarget)}
    >
      {counts.map(([status, n]) => (
        <span key={status} className={`note-count note-count-${status}`}>
          {n}
        </span>
      ))}
    </button>
  )
}

// A note's paragraph, with a warning when the file has fewer paragraphs
// (paragraphs added or removed above it since the note was written).
export function NoteParagraph({ value, paragraphs }) {
  const outside = paragraphs !== null && paragraphs !== undefined && value > paragraphs
  return (
    <span className="edit-note-paragraph">
      ¶ {value}
      {outside && <span className="file-error"> (file has {plural(paragraphs, 'paragraph')})</span>}
    </span>
  )
}

// The status as a select that saves as soon as it changes.
export function NoteStatus({ note, onChanged, label }) {
  const { busy, error, save } = useSave()
  return (
    <>
      <select
        className={`edit-note-status edit-note-status-${note.status}`}
        aria-label={label}
        value={note.status}
        disabled={busy}
        onChange={(e) => save(() => window.ficBible.updateEditNote(note.id, { status: e.target.value }), onChanged)}
      >
        {EDIT_NOTE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <SaveError error={error} />
    </>
  )
}

// Used for a new note and for editing one. With fixedParagraph, the
// paragraph isn't asked for (the prose viewer already knows it), and a
// new note has no status to pick: it starts open.
export function EditNoteForm({ initial, editKinds, paragraphs, fixedParagraph, isNew, busy, error, onSubmit, onCancel, saveLabel }) {
  const [paragraph, setParagraph] = useState(initial.paragraph === null ? '' : String(initial.paragraph))
  const [kind, setKind] = useState(initial.kind)
  const [status, setStatus] = useState(initial.status)
  const [note, setNote] = useState(initial.note)

  function submit(e) {
    e.preventDefault()
    const fields = { kind, note }
    if (!fixedParagraph) fields.paragraph = toNumber(paragraph)
    else fields.paragraph = initial.paragraph
    if (!isNew) fields.status = status
    onSubmit(fields)
  }

  return (
    <form className="edit-form edit-note-form" onSubmit={submit}>
      <div className="edit-row">
        {!fixedParagraph && (
          <Field label={paragraphs === null || paragraphs === undefined ? '¶' : `¶ (file has ${paragraphs})`}>
            {(id) => <NumberInput id={id} value={paragraph} onChange={setParagraph} required />}
          </Field>
        )}
        <Field label="Kind (optional)">
          {(id) => <SuggestInput id={id} value={kind} onChange={setKind} options={editKinds} />}
        </Field>
        {!isNew && (
          <Field label="Status">{(id) => <Select id={id} value={status} onChange={setStatus} options={EDIT_NOTE_STATUSES} />}</Field>
        )}
      </div>
      <Field label="Note" wide>
        {(id) => <textarea id={id} rows={2} value={note} required autoFocus onChange={(e) => setNote(e.target.value)} />}
      </Field>
      <SaveError error={error} />
      <FormActions busy={busy} onCancel={onCancel} saveLabel={saveLabel} />
    </form>
  )
}

function NoteRow({ note, paragraphs, editKinds, onChanged }) {
  const [mode, setMode] = useState('view') // 'view' | 'edit' | 'confirm-delete'
  const { busy, error, save, clearError } = useSave()
  const done = () => {
    setMode('view')
    onChanged()
  }
  const label = `edit note at paragraph ${note.paragraph}`

  if (mode === 'edit') {
    return (
      <tr className="edit-note-editing">
        <td colSpan={5}>
          <EditNoteForm
            initial={note}
            editKinds={editKinds}
            paragraphs={paragraphs}
            busy={busy}
            error={error}
            onSubmit={(fields) => save(() => window.ficBible.updateEditNote(note.id, fields), done)}
            onCancel={() => {
              clearError()
              setMode('view')
            }}
          />
        </td>
      </tr>
    )
  }

  return (
    <tr className={`edit-note edit-note-${note.status}`}>
      <td className="num">
        <NoteParagraph value={note.paragraph} paragraphs={paragraphs} />
      </td>
      <td className="edit-note-kind">{note.kind}</td>
      <td className="edit-note-cell">
        {/* Its own element, so a dealt-with note's fading and a cut note's
            strike-through stop at the text, not the delete prompt. */}
        <span className="edit-note-text">{note.note}</span>
        {mode === 'confirm-delete' && (
          <div className="beat-confirm" role="alert">
            <span>Delete this edit note? This can’t be undone.</span>
            <button
              type="button"
              className="button-danger"
              disabled={busy}
              onClick={() => save(() => window.ficBible.deleteEditNote(note.id), done)}
            >
              Delete
            </button>
            <button type="button" disabled={busy} onClick={() => setMode('view')}>
              Cancel
            </button>
          </div>
        )}
        <SaveError error={error} />
      </td>
      <td>
        <NoteStatus note={note} onChanged={onChanged} label={`Status of ${label}`} />
      </td>
      <td>
        {mode === 'view' && (
          <div className="edit-note-tools">
            <EditButton label={`Edit ${label}`} disabled={busy} onClick={() => setMode('edit')} />
            <DeleteButton label={`Delete ${label}`} disabled={busy} onClick={() => setMode('confirm-delete')} />
          </div>
        )}
      </td>
    </tr>
  )
}

// One note in the popup: read, change its status, or edit it in full.
function PopupNote({ note, editKinds, paragraphs, onChanged }) {
  const [editing, setEditing] = useState(false)
  const { busy, error, save, clearError } = useSave()

  if (editing) {
    return (
      <li className="editor-note editor-note-editing">
        <EditNoteForm
          initial={note}
          editKinds={editKinds}
          paragraphs={paragraphs}
          busy={busy}
          error={error}
          onSubmit={(fields) =>
            save(
              () => window.ficBible.updateEditNote(note.id, fields),
              () => {
                setEditing(false)
                onChanged()
              }
            )
          }
          onCancel={() => {
            clearError()
            setEditing(false)
          }}
        />
      </li>
    )
  }
  return (
    <li className={`editor-note edit-note-${note.status}`}>
      {note.kind && <span className="editor-note-meta edit-note-kind">{note.kind}</span>}
      <span className="edit-note-text">{note.note}</span>
      <span className="editor-popup-tools">
        <NoteStatus note={note} onChanged={onChanged} label={`Status of the note: ${note.note}`} />
        <EditButton label="Edit this note" onClick={() => setEditing(true)} />
      </span>
    </li>
  )
}

// The add form inside the popup. The paragraph is the one the popup is
// for, so it isn't asked for; a new note starts open.
function PopupAdd({ sceneId, paragraph, editKinds, onDone, onCancel }) {
  const { busy, error, save } = useSave()
  return (
    <EditNoteForm
      initial={{ paragraph, kind: '', status: 'open', note: '' }}
      editKinds={editKinds}
      fixedParagraph
      isNew
      busy={busy}
      error={error}
      saveLabel="Add note"
      onSubmit={(fields) => save(() => window.ficBible.createEditNote(sceneId, fields), onDone)}
      onCancel={onCancel}
    />
  )
}

// The notes for one paragraph, placed beside what opened it: a yellow
// count (in the prose viewer, or the prose editor's margin), or a
// paragraph number in the editor's margin, which opens it ready to add a
// note (popup.adding). Escape or a click elsewhere closes it. Shows every
// note on the paragraph, dealt-with ones too, so a status just changed
// can be changed back. What opens it is marked data-note-anchor, so
// clicking it again toggles rather than closing and reopening.
export function NotePopup({ sceneId, popup, notes, editKinds, paragraphs, onChanged, onClose }) {
  const box = useRef(null)
  const [adding, setAdding] = useState(Boolean(popup.adding))
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    const onDown = (e) => {
      if (box.current?.contains(e.target) || e.target.closest?.('[data-note-anchor]')) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  return (
    <div
      ref={box}
      className="editor-popup"
      role="dialog"
      aria-label={`Edit notes at paragraph ${popup.paragraph}`}
      style={{ top: popup.top, left: popup.left }}
    >
      <div className="editor-popup-head">
        <strong>¶ {popup.paragraph}</strong>
        <button type="button" className="link-button" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      {notes.length === 0 && !adding && <p className="muted">No edit notes here.</p>}
      {notes.length > 0 && (
        <ul className="editor-notes-list">
          {notes.map((note) => (
            <PopupNote key={note.id} note={note} editKinds={editKinds} paragraphs={paragraphs} onChanged={onChanged} />
          ))}
        </ul>
      )}
      {adding ? (
        <div className="editor-popup-add">
          <PopupAdd
            sceneId={sceneId}
            paragraph={popup.paragraph}
            editKinds={editKinds}
            onDone={() => {
              setAdding(false)
              onChanged()
            }}
            onCancel={() => (notes.length === 0 ? onClose() : setAdding(false))}
          />
        </div>
      ) : (
        <button type="button" className="link-button editor-popup-new" onClick={() => setAdding(true)}>
          + Add note
        </button>
      )}
    </div>
  )
}

const EMPTY_NOTE = { paragraph: null, kind: '', status: 'open', note: '' }

function AddNote({ sceneId, editKinds, paragraphs, onChanged }) {
  const [open, setOpen] = useState(false)
  const { busy, error, save, clearError } = useSave()

  if (!open) {
    return (
      <button type="button" className="add-beat" onClick={() => setOpen(true)}>
        + Add edit note
      </button>
    )
  }
  return (
    <div className="beat beat-editing">
      <EditNoteForm
        initial={EMPTY_NOTE}
        editKinds={editKinds}
        paragraphs={paragraphs}
        isNew
        busy={busy}
        error={error}
        saveLabel="Add edit note"
        onSubmit={(fields) =>
          save(
            () => window.ficBible.createEditNote(sceneId, fields),
            () => {
              setOpen(false)
              onChanged()
            }
          )
        }
        onCancel={() => {
          clearError()
          setOpen(false)
        }}
      />
    </div>
  )
}

function Summary({ notes }) {
  if (notes.length === 0) {
    return <p className="beat-summary muted">No edit notes yet. Add them here, or by clicking a paragraph number in View prose.</p>
  }
  const open = openCount(notes)
  return (
    <p className="beat-summary">
      {open === 0 ? (
        <span className="nothing-missing">All {plural(notes.length, 'edit note')} dealt with</span>
      ) : (
        <>
          <strong className="still-missing">{open} open</strong>
          <span className="muted"> of {plural(notes.length, 'edit note')}</span>
        </>
      )}
    </p>
  )
}

// The scene page's table. scene is the scene detail: { id, paragraphs, editNotes }.
export default function EditNotesTable({ scene, editKinds, onChanged }) {
  const notes = scene.editNotes
  return (
    <>
      <Summary notes={notes} />
      {notes.length > 0 && (
        <table className="edit-notes">
          <thead>
            <tr>
              <th className="num">¶</th>
              <th>Kind</th>
              <th>Note</th>
              <th>Status</th>
              <th>
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {notes.map((note) => (
              <NoteRow key={note.id} note={note} paragraphs={scene.paragraphs} editKinds={editKinds} onChanged={onChanged} />
            ))}
          </tbody>
        </table>
      )}
      <AddNote sceneId={scene.id} editKinds={editKinds} paragraphs={scene.paragraphs} onChanged={onChanged} />
    </>
  )
}
