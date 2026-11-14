import { useState } from 'react'
import {
  EDIT_NOTE_STATUSES,
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
      <td className="edit-note-text">
        {note.note}
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
          <div className="beat-tools edit-note-tools">
            <button type="button" aria-label={`Edit ${label}`} disabled={busy} onClick={() => setMode('edit')}>
              Edit
            </button>
            <button type="button" aria-label={`Delete ${label}`} disabled={busy} onClick={() => setMode('confirm-delete')}>
              Delete
            </button>
          </div>
        )}
      </td>
    </tr>
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
