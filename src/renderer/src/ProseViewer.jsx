import { useState } from 'react'
import { useQuery } from './useQuery.js'
import { QueryError } from './QueryError.jsx'
import Markdown from './Markdown.jsx'
import { number } from './labels.jsx'
import { useSave, useSuggestions } from './editing.jsx'
import { EditNoteForm, openCount } from './EditNotes.jsx'

const count = (n, noun) => `${number(n)} ${noun}${n === 1 ? '' : 's'}`

// Read-only view of a scene's file (editing is ProseEditor, a separate
// screen), numbered by paragraph so a beat's
// paragraph_ref can be found. The paragraphs come from the main process
// already split by splitParagraphs, the same split the paragraph count
// uses; the number shown is the paragraph's place in that list, 1-based.

// A paragraph number that opens the add-note form, with the count of the
// paragraph's open edit notes beside it. Their text is the tooltip.
function NoteNumber({ n, notes, adding, onClick }) {
  const open = notes.filter((note) => note.status === 'open')
  const title = [
    `Add an edit note at paragraph ${n}`,
    ...open.map((note) => `• ${note.kind ? `${note.kind}: ` : ''}${note.note}`)
  ].join('\n')
  return (
    <span className="prose-number">
      <button
        type="button"
        className={`prose-number-button${adding ? ' prose-number-active' : ''}`}
        title={title}
        aria-label={`Paragraph ${n}${open.length ? `, ${open.length} open edit notes` : ''}: add an edit note`}
        aria-expanded={adding}
        onClick={onClick}
      >
        {n}
      </button>
      {open.length > 0 && (
        <span className="prose-note-count" aria-hidden="true">
          {open.length}
        </span>
      )}
    </span>
  )
}

function AddNoteHere({ sceneId, paragraph, editKinds, onDone, onCancel }) {
  const { busy, error, save } = useSave()
  return (
    <div className="prose-add-note">
      <EditNoteForm
        initial={{ paragraph, kind: '', status: 'open', note: '' }}
        editKinds={editKinds}
        fixedParagraph
        isNew
        busy={busy}
        error={error}
        saveLabel={`Add note at ¶ ${paragraph}`}
        onSubmit={(fields) => save(() => window.ficBible.createEditNote(sceneId, fields), onDone)}
        onCancel={onCancel}
      />
    </div>
  )
}

// With onNoteAdded, each paragraph number opens a form to add an edit
// note there (spec: Scene prose viewer). That writes a database row only;
// the prose stays read-only. Without it (the chapter read view), the
// numbers are plain text.
export function Body({ scene, editKinds = [], onNoteAdded }) {
  const [adding, setAdding] = useState(null)
  if (scene.fileError !== null) {
    const what = scene.fileError === 'ENOENT' ? 'The scene file is missing' : "The scene file couldn't be read"
    return (
      <p className="file-error" title={scene.path}>
        {what} ({scene.fileError}).
      </p>
    )
  }
  if (scene.paragraphs.length === 0) return <p className="muted">No paragraphs yet: the file is empty.</p>

  return (
    <ol className="prose">
      {scene.paragraphs.map((paragraph, i) => {
        const n = i + 1
        return (
          <li key={i} className="prose-paragraph">
            {onNoteAdded ? (
              <NoteNumber
                n={n}
                notes={scene.editNotes.filter((note) => note.paragraph === n)}
                adding={adding === n}
                onClick={() => setAdding(adding === n ? null : n)}
              />
            ) : (
              <span className="prose-number">{n}</span>
            )}
            <div className="prose-text">
              <Markdown paragraph={paragraph} />
            </div>
            {adding === n && (
              <AddNoteHere
                key={n}
                sceneId={scene.id}
                paragraph={n}
                editKinds={editKinds}
                onCancel={() => setAdding(null)}
                onDone={() => {
                  setAdding(null)
                  onNoteAdded()
                }}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

// Previous / next links, above and below the prose. Either side is null
// at the start or end; that side is left empty so the other stays put.
// label(item) is the link's text.
export function Flip({ previous, next, label, onOpen, what }) {
  return (
    <nav className="prose-flip" aria-label={`Previous and next ${what}`}>
      {previous ? (
        <button type="button" className="link-button prose-flip-previous" onClick={() => onOpen(previous)}>
          ← {label(previous)}
        </button>
      ) : (
        <span />
      )}
      {next && (
        <button type="button" className="link-button prose-flip-next" onClick={() => onOpen(next)}>
          {label(next)} →
        </button>
      )}
    </nav>
  )
}

const sceneLabel = (s) => `Ch ${s.chapterNumber}, scene ${s.position}: ${s.title}`

// onOpenScene(scene) opens another scene's prose: scene is
// { id, chapterId, ... } from previous or next.
// Adding an edit note re-reads the scene here (so its count shows by the
// number) without blanking the page.
export default function ProseViewer({ sceneId, onBack, onOpenScene, onEditProse }) {
  const [notesVersion, setNotesVersion] = useState(0)
  const result = useQuery(() => window.ficBible.sceneProse(sceneId), sceneId, notesVersion)
  const { editKinds } = useSuggestions(notesVersion)

  const back = (
    <button type="button" className="link-button" onClick={onBack}>
      ← Back to scene
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
  return (
    <article className="prose-viewer">
      <header>
        {back}
        <p className="muted">
          {scene.work.title} · Chapter {scene.chapter.number}: {scene.chapter.title}
        </p>
        <h1>{scene.title}</h1>
        {scene.fileError === null && (
          <button type="button" className="link-button edit-prose" onClick={onEditProse}>
            Edit prose →
          </button>
        )}
        {scene.paragraphs?.length > 0 && (
          <p className="muted">
            {count(scene.paragraphs.length, 'paragraph')} · {count(scene.wordcount, 'word')}
            {openCount(scene.editNotes) > 0 && ` · ${count(openCount(scene.editNotes), 'open edit note')}`}
          </p>
        )}
        {scene.paragraphs?.length > 0 && (
          <p className="muted prose-note-hint">Click a paragraph number to add an edit note.</p>
        )}
        <Flip previous={scene.previous} next={scene.next} label={sceneLabel} onOpen={onOpenScene} what="scene" />
      </header>
      <Body
        key={scene.id}
        scene={scene}
        editKinds={editKinds}
        onNoteAdded={() => setNotesVersion((v) => v + 1)}
      />
      <footer className="prose-footer">
        <Flip previous={scene.previous} next={scene.next} label={sceneLabel} onOpen={onOpenScene} what="scene" />
      </footer>
    </article>
  )
}
