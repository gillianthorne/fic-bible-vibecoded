import { useState } from 'react'
import { NoteRow, openCount } from './EditNotes.jsx'

// The chapter's edit notes (spec: Chapter overview), grouped by kind
// (ignoring case, notes with no kind last), then by scene. The main
// process sends them already in that order. Only open notes show unless
// the dealt-with ones are asked for. Each row edits like the scene
// page's; its scene opens with onOpenScene(sceneId).

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// Consecutive notes whose kinds match ignoring case, as
// [{ kind, notes }]. The heading uses the first note's spelling.
function byKind(notes) {
  const groups = []
  for (const note of notes) {
    const last = groups[groups.length - 1]
    if (last && last.kind.toLowerCase() === note.kind.toLowerCase()) last.notes.push(note)
    else groups.push({ kind: note.kind, notes: [note] })
  }
  return groups
}

export default function ChapterEditNotes({ notes, scenes, editKinds, onChanged, onOpenScene }) {
  const [showAll, setShowAll] = useState(false)
  const open = openCount(notes)
  const dealtWith = notes.length - open
  const shown = showAll ? notes : notes.filter((n) => n.status === 'open')
  const paragraphs = new Map(scenes.map((s) => [s.id, s.paragraphs]))

  return (
    <section className="chapter-edit-notes" aria-label="Edit notes">
      <h2>Edit notes</h2>
      {notes.length === 0 ? (
        <p className="beat-summary muted">No edit notes in this chapter.</p>
      ) : (
        <p className="beat-summary">
          {open === 0 ? (
            <span className="nothing-missing">All {plural(notes.length, 'edit note')} dealt with</span>
          ) : (
            <>
              <strong className="still-missing">{open} open</strong>
              <span className="muted"> of {plural(notes.length, 'edit note')}</span>
            </>
          )}
          {dealtWith > 0 && (
            <>
              {' · '}
              <button type="button" className="link-button" onClick={() => setShowAll(!showAll)}>
                {showAll ? 'Show open notes only' : `Show ${dealtWith} dealt with`}
              </button>
            </>
          )}
        </p>
      )}

      {byKind(shown).map((group) => (
        <div key={group.kind.toLowerCase()} className="chapter-edit-group">
          <h3>
            {group.kind || <span className="muted">No kind</span>}{' '}
            <span className="muted chapter-edit-count">{group.notes.length}</span>
          </h3>
          <table className="edit-notes">
            <thead>
              <tr>
                <th>Scene</th>
                <th className="num">¶</th>
                <th>Note</th>
                <th>Status</th>
                <th>
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {group.notes.map((note) => (
                <NoteRow
                  key={note.id}
                  note={note}
                  paragraphs={paragraphs.get(note.sceneId) ?? null}
                  editKinds={editKinds}
                  onChanged={onChanged}
                  sceneCell={
                    <button type="button" className="link-button" onClick={() => onOpenScene(note.sceneId)}>
                      {note.scenePosition}. {note.sceneTitle}
                    </button>
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  )
}
