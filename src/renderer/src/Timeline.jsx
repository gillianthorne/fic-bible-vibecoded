import { useState } from 'react'
import { useQuery } from './useQuery.js'
import { QueryError } from './QueryError.jsx'
import { DeleteButton, EditButton, MoveButton, Field, FormActions, SaveError, useSave } from './editing.jsx'

// A work's timeline (spec: Timeline): events in story order, which the
// author sets with up and down, each with a free-text in-fic date, an
// optional chapter link, and notes. Saved straight away; onChanged()
// then reads the timeline again.

const chapterLabel = (ch) => `${ch.number}. ${ch.title}`

function EventForm({ initial, chapters, busy, error, onSubmit, onCancel, saveLabel }) {
  const [event, setEvent] = useState(initial.event)
  const [date, setDate] = useState(initial.date)
  const [chapterId, setChapterId] = useState(initial.chapter?.id ?? null)
  const [notes, setNotes] = useState(initial.notes ?? '')

  function submit(e) {
    e.preventDefault()
    onSubmit({ event, date, chapterId, notes })
  }

  return (
    <form className="edit-form" onSubmit={submit}>
      <Field label="Event" wide>
        {(id) => <input id={id} type="text" value={event} required autoFocus onChange={(e) => setEvent(e.target.value)} />}
      </Field>
      <div className="edit-row">
        <Field label="In-fic date">
          {(id) => <input id={id} type="text" value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <Field label="Chapter">
          {(id) => (
            <select id={id} value={chapterId ?? ''} onChange={(e) => setChapterId(e.target.value === '' ? null : Number(e.target.value))}>
              <option value="">None</option>
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {chapterLabel(c)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <Field label="Notes" wide>
        {(id) => <textarea id={id} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}
      </Field>
      <SaveError error={error} />
      <FormActions busy={busy} onCancel={onCancel} saveLabel={saveLabel} />
    </form>
  )
}

function Event({ event, index, count, workId, chapters, onChanged, onOpenChapter }) {
  const [mode, setMode] = useState('view') // 'view' | 'edit' | 'confirm-delete'
  const { busy, error, save, clearError } = useSave()
  const done = () => {
    setMode('view')
    onChanged()
  }

  if (mode === 'edit') {
    return (
      <li className="beat beat-editing">
        <div className="beat-body">
          <EventForm
            initial={event}
            chapters={chapters}
            busy={busy}
            error={error}
            onSubmit={(fields) => save(() => window.ficBible.updateTimelineEvent(event.id, fields), done)}
            onCancel={() => {
              clearError()
              setMode('view')
            }}
          />
        </div>
      </li>
    )
  }

  return (
    <li className="beat timeline-event">
      <span className="timeline-date">{event.date || <span className="muted">—</span>}</span>
      <div className="beat-body">
        <p className="timeline-what">{event.event}</p>
        {event.chapter && (
          <button type="button" className="link-button timeline-chapter" onClick={() => onOpenChapter(event.chapter.id, workId)}>
            Chapter {chapterLabel(event.chapter)}
          </button>
        )}
        {event.notes && <p className="timeline-notes">{event.notes}</p>}
        {mode === 'confirm-delete' && (
          <div className="beat-confirm" role="alert">
            <span>Delete “{event.event}”? This can’t be undone.</span>
            <button
              type="button"
              className="button-danger"
              disabled={busy}
              onClick={() => save(() => window.ficBible.deleteTimelineEvent(event.id), done)}
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
          <MoveButton
            direction="up"
            label={`Move ${event.event} earlier`}
            title="Move earlier"
            disabled={busy || index === 0}
            onClick={() => save(() => window.ficBible.moveTimelineEvent(event.id, 'up'), onChanged)}
          />
          <MoveButton
            direction="down"
            label={`Move ${event.event} later`}
            title="Move later"
            disabled={busy || index === count - 1}
            onClick={() => save(() => window.ficBible.moveTimelineEvent(event.id, 'down'), onChanged)}
          />
          <EditButton label={`Edit ${event.event}`} disabled={busy} onClick={() => setMode('edit')} />
          <DeleteButton label={`Delete ${event.event}`} disabled={busy} onClick={() => setMode('confirm-delete')} />
        </div>
      )}
    </li>
  )
}

function AddEvent({ workId, chapters, onChanged }) {
  const [open, setOpen] = useState(false)
  const { busy, error, save, clearError } = useSave()
  if (!open) {
    return (
      <button type="button" className="add-beat" onClick={() => setOpen(true)}>
        + Add event
      </button>
    )
  }
  return (
    <div className="beat beat-editing">
      <div className="beat-body">
        <EventForm
          initial={{ event: '', date: '', chapter: null, notes: null }}
          chapters={chapters}
          busy={busy}
          error={error}
          saveLabel="Add event"
          onSubmit={(fields) =>
            save(
              () => window.ficBible.createTimelineEvent(workId, fields),
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
    </div>
  )
}

export default function Timeline({ workId, refreshKey, onChanged, onOpenChapter }) {
  const result = useQuery(() => window.ficBible.timeline(workId), workId, refreshKey)

  if (result.loading) return <p className="muted">Loading…</p>
  if (result.ok === false) return <QueryError what="the timeline" error={result.error} />
  if (result.data === null) return <p className="muted">Work not found.</p>

  const { work, events, chapters } = result.data
  return (
    <article className="scene-detail timeline">
      <header>
        <p className="muted">{work.title} · Notes</p>
        <h1>Timeline</h1>
        <p className="muted">In story order. Use the arrows to move events earlier or later.</p>
      </header>
      {events.length === 0 ? (
        <p className="muted">No events yet.</p>
      ) : (
        <ol className="beats timeline-events">
          {events.map((event, index) => (
            <Event
              key={event.id}
              event={event}
              index={index}
              count={events.length}
              workId={workId}
              chapters={chapters}
              onChanged={onChanged}
              onOpenChapter={onOpenChapter}
            />
          ))}
        </ol>
      )}
      <AddEvent workId={workId} chapters={chapters} onChanged={onChanged} />
    </article>
  )
}
