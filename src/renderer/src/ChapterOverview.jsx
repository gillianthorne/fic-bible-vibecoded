import { useState } from 'react'
import { useQuery } from './useQuery.js'
import { QueryError } from './QueryError.jsx'
import { number, Status, Wordcount } from './labels.jsx'
import { CHAPTER_STATUSES, Field, FormActions, NumberInput, SaveError, Select, toNumber, useSave } from './editing.jsx'

// Every scene in the chapter, so its shape is readable without clicking
// into anything. Wordcounts come from the scene files, read by the main
// process on every load. The header's fields can be edited, and so can the
// work's title, since works have no screen of their own.

function WorkTitle({ work, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(work.title)
  const { busy, error, save } = useSave()

  if (!editing) {
    return (
      <div className="title-row work-title-row">
        <p className="muted">{work.title}</p>
        <button
          type="button"
          className="edit-button"
          onClick={() => {
            setTitle(work.title)
            setEditing(true)
          }}
        >
          Edit work title
        </button>
      </div>
    )
  }
  function submit(e) {
    e.preventDefault()
    save(
      () => window.ficBible.updateWork(work.id, { title }),
      () => {
        setEditing(false)
        onChanged()
      }
    )
  }
  return (
    <form className="edit-form chapter-form" onSubmit={submit}>
      <Field label="Work title" wide>
        {(id) => <input id={id} type="text" value={title} required autoFocus onChange={(e) => setTitle(e.target.value)} />}
      </Field>
      <p className="muted edit-note">Folder: {work.folder} (the app doesn’t rename folders)</p>
      <SaveError error={error} />
      <FormActions busy={busy} onCancel={() => setEditing(false)} />
    </form>
  )
}

// A posted date and AO3 link are stored as given; leaving them blank
// stores null. The link is shown as text, never opened by the app.
function ChapterForm({ chapter, onDone, onCancel }) {
  const [num, setNum] = useState(String(chapter.number))
  const [title, setTitle] = useState(chapter.title)
  const [status, setStatus] = useState(chapter.status)
  const [postedDate, setPostedDate] = useState(chapter.postedDate ?? '')
  const [postedUrl, setPostedUrl] = useState(chapter.postedUrl ?? '')
  const { busy, error, save } = useSave()

  function submit(e) {
    e.preventDefault()
    save(
      () =>
        window.ficBible.updateChapter(chapter.id, {
          number: toNumber(num),
          title,
          status,
          postedDate: postedDate === '' ? null : postedDate,
          postedUrl
        }),
      onDone
    )
  }

  return (
    <form className="edit-form chapter-form" onSubmit={submit}>
      <div className="edit-row">
        <Field label="Number">{(id) => <NumberInput id={id} value={num} onChange={setNum} required />}</Field>
        <Field label="Status">{(id) => <Select id={id} value={status} onChange={setStatus} options={CHAPTER_STATUSES} />}</Field>
        <Field label="Posted date">
          {(id) => <input id={id} type="date" value={postedDate} onChange={(e) => setPostedDate(e.target.value)} />}
        </Field>
      </div>
      <Field label="Title" wide>
        {(id) => <input id={id} type="text" value={title} required autoFocus onChange={(e) => setTitle(e.target.value)} />}
      </Field>
      <Field label="AO3 link" wide>
        {(id) => <input id={id} type="url" value={postedUrl} onChange={(e) => setPostedUrl(e.target.value)} />}
      </Field>
      <p className="muted edit-note">Folder: {chapter.folder} (the app doesn’t rename folders)</p>
      <SaveError error={error} />
      <FormActions busy={busy} onCancel={onCancel} />
    </form>
  )
}

function ChapterHeader({ chapter, onChanged }) {
  const [editing, setEditing] = useState(false)
  return (
    <header>
      <WorkTitle key={chapter.work.id} work={chapter.work} onChanged={onChanged} />
      {editing ? (
        <ChapterForm
          chapter={chapter}
          onCancel={() => setEditing(false)}
          onDone={() => {
            setEditing(false)
            onChanged()
          }}
        />
      ) : (
        <>
          <div className="title-row">
            <h1>
              Chapter {chapter.number}: {chapter.title}
            </h1>
            <button type="button" className="edit-button" onClick={() => setEditing(true)}>
              Edit chapter
            </button>
          </div>
          <p>
            <Status value={chapter.status} />
            {chapter.postedDate && <span className="muted"> on {chapter.postedDate}</span>}
          </p>
          {chapter.postedUrl && <p className="muted posted-url">{chapter.postedUrl}</p>}
        </>
      )}
    </header>
  )
}

// refreshKey re-reads the chapter without blanking it; onChanged() is
// called after an edit so App can bump it (and refresh the sidebar).
// onOpenScene(id) opens a scene's detail; any click on its row does it.
export default function ChapterOverview({ chapterId, refreshKey, onChanged, onOpenScene }) {
  const result = useQuery(() => window.ficBible.chapterOverview(chapterId), chapterId, refreshKey)

  if (result.loading) return <p className="muted">Loading…</p>
  if (result.ok === false) return <QueryError what="this chapter" error={result.error} />
  if (result.data === null) return <p className="muted">Chapter not found.</p>

  const { chapter, scenes, wordcount, uncounted } = result.data
  return (
    <article className="chapter-overview">
      <ChapterHeader key={chapter.id} chapter={chapter} onChanged={onChanged} />

      {scenes.length === 0 ? (
        <p className="muted">No scenes in this chapter.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th rowSpan={2} className="num">#</th>
              <th rowSpan={2}>Title</th>
              <th rowSpan={2}>POV</th>
              <th rowSpan={2}>Status</th>
              <th rowSpan={2} className="num">Words</th>
              <th colSpan={4} className="beats-group">Beats</th>
            </tr>
            <tr>
              <th className="num">Planned</th>
              <th className="num">In draft</th>
              <th className="num">Cut</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {scenes.map((scene) => (
              <tr key={scene.id} onClick={() => onOpenScene(scene.id)}>
                <td className="num">{scene.position}</td>
                <td>
                  {/* No handler of its own: its click, from the mouse or
                      Enter/Space, reaches the row's. The button is what
                      makes the row reachable by keyboard. */}
                  <button type="button" className="link-button scene-link">
                    {scene.title}
                  </button>
                </td>
                <td>{scene.pov}</td>
                <td>
                  <Status value={scene.status} />
                </td>
                <td className="num">
                  <Wordcount scene={scene} />
                </td>
                <td className="num">{scene.beats.planned}</td>
                <td className="num">{scene.beats.inDraft}</td>
                <td className="num">{scene.beats.cut}</td>
                <td className="num">{scene.beats.total}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={4} scope="row">
                Chapter total
                {uncounted > 0 && (
                  <span className="file-error">
                    {' '}
                    ({uncounted} {uncounted === 1 ? 'scene' : 'scenes'} not counted)
                  </span>
                )}
              </th>
              <td className="num">{number(wordcount)}</td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>
      )}
    </article>
  )
}
