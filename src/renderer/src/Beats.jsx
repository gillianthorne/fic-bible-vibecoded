import { useState } from 'react'
import {
  BEAT_STATUSES,
  Field,
  FormActions,
  NumberInput,
  SaveError,
  Select,
  SuggestInput,
  toNumber,
  useSave
} from './editing.jsx'

// The scene's beats, editable in place (spec: Scene detail): add, edit,
// reorder, change kind or status, set or clear the paragraph reference,
// delete. Every change is saved straight away and then onChanged() makes
// the screen read the scene again, so what's shown is what's stored.

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

function ParagraphRef({ value, paragraphs }) {
  if (value === null) return null
  const outside = paragraphs !== null && value > paragraphs
  return (
    <span className="beat-ref">
      ¶ {value}
      {outside && <span className="file-error"> (file has {plural(paragraphs, 'paragraph')})</span>}
    </span>
  )
}

// Used for both a new beat and editing one. onSubmit gets the fields.
function BeatForm({ initial, kinds, paragraphs, busy, error, onSubmit, onCancel, saveLabel }) {
  const [kind, setKind] = useState(initial.kind)
  const [status, setStatus] = useState(initial.status)
  const [ref, setRef] = useState(initial.paragraphRef === null ? '' : String(initial.paragraphRef))
  const [content, setContent] = useState(initial.content)

  function submit(e) {
    e.preventDefault()
    onSubmit({ kind, status, paragraphRef: toNumber(ref), content })
  }

  return (
    <form className="edit-form beat-form" onSubmit={submit}>
      <div className="edit-row">
        <Field label="Kind">{(id) => <SuggestInput id={id} value={kind} onChange={setKind} options={kinds} required />}</Field>
        <Field label="Status">{(id) => <Select id={id} value={status} onChange={setStatus} options={BEAT_STATUSES} />}</Field>
        <Field label={paragraphs === null ? '¶ (optional)' : `¶ (optional, file has ${paragraphs})`}>
          {(id) => <NumberInput id={id} value={ref} onChange={setRef} />}
        </Field>
      </div>
      <Field label="Beat" wide>
        {(id) => <textarea id={id} rows={3} value={content} required onChange={(e) => setContent(e.target.value)} autoFocus />}
      </Field>
      <SaveError error={error} />
      <FormActions busy={busy} onCancel={onCancel} saveLabel={saveLabel} />
    </form>
  )
}

function Beat({ beat, index, count, paragraphs, kinds, onChanged }) {
  const [mode, setMode] = useState('view') // 'view' | 'edit' | 'confirm-delete'
  const { busy, error, save, clearError } = useSave()
  const done = () => {
    setMode('view')
    onChanged()
  }
  const label = `beat ${index + 1}`

  if (mode === 'edit') {
    return (
      <li className="beat beat-editing">
        <BeatForm
          initial={beat}
          kinds={kinds}
          paragraphs={paragraphs}
          busy={busy}
          error={error}
          onSubmit={(fields) => save(() => window.ficBible.updateBeat(beat.id, fields), done)}
          onCancel={() => {
            clearError()
            setMode('view')
          }}
        />
      </li>
    )
  }

  return (
    <li className={`beat beat-${beat.status.replace(/\s+/g, '-')}`}>
      <span className="beat-marker" aria-hidden="true" />
      <div className="beat-body">
        <div className="beat-meta">
          <span className="beat-kind">{beat.kind}</span>
          <span className="beat-status">{beat.status}</span>
          <ParagraphRef value={beat.paragraphRef} paragraphs={paragraphs} />
        </div>
        <p className="beat-content">{beat.content}</p>
        {mode === 'confirm-delete' && (
          <div className="beat-confirm" role="alert">
            <span>Delete this beat? This can’t be undone.</span>
            <button
              type="button"
              className="button-danger"
              disabled={busy}
              onClick={() => save(() => window.ficBible.deleteBeat(beat.id), done)}
            >
              Delete
            </button>
            <button type="button" disabled={busy} onClick={() => setMode('view')}>
              Cancel
            </button>
          </div>
        )}
        <SaveError error={error} />
      </div>
      {mode === 'view' && (
        <div className="beat-tools">
          <button
            type="button"
            aria-label={`Move ${label} up`}
            title="Move up"
            disabled={busy || index === 0}
            onClick={() => save(() => window.ficBible.moveBeat(beat.id, 'up'), onChanged)}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`Move ${label} down`}
            title="Move down"
            disabled={busy || index === count - 1}
            onClick={() => save(() => window.ficBible.moveBeat(beat.id, 'down'), onChanged)}
          >
            ↓
          </button>
          <button type="button" aria-label={`Edit ${label}`} disabled={busy} onClick={() => setMode('edit')}>
            Edit
          </button>
          <button type="button" aria-label={`Delete ${label}`} disabled={busy} onClick={() => setMode('confirm-delete')}>
            Delete
          </button>
        </div>
      )}
    </li>
  )
}

const EMPTY_BEAT = { kind: '', status: 'planned', paragraphRef: null, content: '' }

function AddBeat({ sceneId, kinds, paragraphs, onChanged }) {
  const [open, setOpen] = useState(false)
  const { busy, error, save, clearError } = useSave()

  if (!open) {
    return (
      <button type="button" className="add-beat" onClick={() => setOpen(true)}>
        + Add beat
      </button>
    )
  }
  return (
    <div className="beat beat-editing">
      <BeatForm
        initial={EMPTY_BEAT}
        kinds={kinds}
        paragraphs={paragraphs}
        busy={busy}
        error={error}
        saveLabel="Add beat"
        onSubmit={(fields) =>
          save(
            () => window.ficBible.createBeat(sceneId, fields),
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

export default function BeatList({ scene, kinds, onChanged }) {
  return (
    <>
      {scene.beats.length > 0 && (
        <ol className="beats">
          {scene.beats.map((beat, index) => (
            <Beat
              key={beat.id}
              beat={beat}
              index={index}
              count={scene.beats.length}
              paragraphs={scene.paragraphs}
              kinds={kinds}
              onChanged={onChanged}
            />
          ))}
        </ol>
      )}
      <AddBeat sceneId={scene.id} kinds={kinds} paragraphs={scene.paragraphs} onChanged={onChanged} />
    </>
  )
}
