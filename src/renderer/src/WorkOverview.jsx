import { useState } from 'react'
import { useQuery } from './useQuery.js'
import { QueryError } from './QueryError.jsx'
import { number, Status } from './labels.jsx'
import { EditButton, Field, FormActions, SaveError, SuggestInput, useSave, useSuggestions } from './editing.jsx'
import Notes, { ExternalLink } from './Notes.jsx'

// The work's home page: its title, link and total wordcount, its notes,
// and every chapter as a simple table. Wordcounts come from the scene
// files, read by the main process on every load.

// A blank link is stored as null, "no link". Fandom and ship are typed
// names, offered from the ones already used; a blank ship is gen. Ships
// offered are the typed fandom's own.
function WorkForm({ work, suggestions, onDone, onCancel }) {
  const [title, setTitle] = useState(work.title)
  const [url, setUrl] = useState(work.url ?? '')
  const [fandom, setFandom] = useState(work.fandom ?? '')
  const [ship, setShip] = useState(work.ship ?? '')
  const { busy, error, save } = useSave()

  const fandomOptions = suggestions.fandoms.map((name) => ({ value: name }))
  const shipOptions = suggestions.ships
    .filter((s) => s.fandom.toLowerCase() === fandom.trim().toLowerCase())
    .map((s) => ({ value: s.name }))

  function submit(e) {
    e.preventDefault()
    save(() => window.ficBible.updateWork(work.id, { title, url, fandom, ship }), onDone)
  }

  return (
    <form className="edit-form chapter-form" onSubmit={submit}>
      <Field label="Title" wide>
        {(id) => <input id={id} type="text" value={title} required autoFocus onChange={(e) => setTitle(e.target.value)} />}
      </Field>
      <Field label="Work link" wide>
        {(id) => <input id={id} type="url" value={url} placeholder="https://" onChange={(e) => setUrl(e.target.value)} />}
      </Field>
      <Field label="Fandom" wide>
        {(id) => <SuggestInput id={id} value={fandom} onChange={setFandom} options={fandomOptions} />}
      </Field>
      <Field label="Ship (blank for gen)" wide>
        {(id) => <SuggestInput id={id} value={ship} onChange={setShip} options={shipOptions} />}
      </Field>
      <SaveError error={error} />
      <FormActions busy={busy} onCancel={onCancel} />
    </form>
  )
}

function WorkHeader({ work, wordcount, uncounted, refreshKey, onChanged }) {
  const [editing, setEditing] = useState(false)
  const suggestions = useSuggestions(refreshKey)
  return (
    <header>
      {editing ? (
        <WorkForm
          work={work}
          suggestions={suggestions}
          onCancel={() => setEditing(false)}
          onDone={() => {
            setEditing(false)
            onChanged()
          }}
        />
      ) : (
        <>
          <div className="title-row">
            <h1>{work.title}</h1>
            <EditButton label="Edit work" onClick={() => setEditing(true)} />
          </div>
          <p className="work-fandom">
            {work.fandom ? (
              <>
                {work.fandom} · {work.ship ?? 'Gen'}
              </>
            ) : (
              <span className="muted">No fandom set</span>
            )}
          </p>
          {work.url && (
            <p className="work-link">
              <ExternalLink href={work.url}>Work page ↗</ExternalLink>
            </p>
          )}
        </>
      )}
      <p className="muted">
        {number(wordcount)} {wordcount === 1 ? 'word' : 'words'}
        {uncounted > 0 && (
          <span className="file-error">
            {' '}
            ({uncounted} {uncounted === 1 ? 'scene' : 'scenes'} not counted)
          </span>
        )}
      </p>
    </header>
  )
}

// refreshKey re-reads the work without blanking it; onChanged() is called
// after an edit. onOpenChapter(chapterId, workId) opens a chapter's
// overview; any click on its row does it, except on its link.
export default function WorkOverview({ workId, refreshKey, onChanged, onOpenChapter }) {
  const result = useQuery(() => window.ficBible.workOverview(workId), workId, refreshKey)

  if (result.loading) return <p className="muted">Loading…</p>
  if (result.ok === false) return <QueryError what="this work" error={result.error} />
  if (result.data === null) return <p className="muted">Work not found.</p>

  const { work, chapters, wordcount, uncounted } = result.data
  return (
    <article className="work-overview">
      <WorkHeader
        key={work.id}
        work={work}
        wordcount={wordcount}
        uncounted={uncounted}
        refreshKey={refreshKey}
        onChanged={onChanged}
      />

      <Notes
        key={`notes-${work.id}`}
        notes={work.notes}
        what="work"
        saveNotes={(notes) => window.ficBible.updateWork(work.id, { notes })}
        onChanged={onChanged}
      />

      <section aria-label="Chapters">
        <h2>Chapters</h2>
        {chapters.length === 0 ? (
          <p className="muted">No chapters in this work.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Title</th>
                <th className="num">Words</th>
                <th>Status</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {chapters.map((ch) => (
                <tr key={ch.id} onClick={() => onOpenChapter(ch.id, work.id)}>
                  <td className="num">{ch.number}</td>
                  <td>
                    {/* No handler of its own: its click reaches the row's.
                        The button makes the row reachable by keyboard. */}
                    <button type="button" className="link-button scene-link">
                      {ch.title}
                    </button>
                  </td>
                  <td className="num">
                    {number(ch.wordcount)}
                    {ch.uncounted > 0 && (
                      <span className="file-error" title={`${ch.uncounted} scene files couldn’t be read`}>
                        {' '}
                        *
                      </span>
                    )}
                  </td>
                  <td>
                    <Status value={ch.status} />
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {ch.postedUrl ? <ExternalLink href={ch.postedUrl}>Open ↗</ExternalLink> : <span className="muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </article>
  )
}
