import { useQuery } from './useQuery.js'
import { QueryError } from './QueryError.jsx'

// Read-only. Every scene in the chapter, so its shape is readable without
// clicking into anything. Wordcounts come from the scene files, read by
// the main process on every load.

const number = (n) => n.toLocaleString()

function Wordcount({ scene }) {
  if (scene.wordcount !== null) return number(scene.wordcount)
  const label = scene.fileError === 'ENOENT' ? 'file missing' : 'unreadable'
  return (
    <span className="file-error" title={scene.fileError}>
      {label}
    </span>
  )
}

function Status({ value }) {
  return <span className={`status status-${value.replace(/\s+/g, '-')}`}>{value}</span>
}

export default function ChapterOverview({ chapterId }) {
  const result = useQuery(() => window.ficBible.chapterOverview(chapterId), chapterId)

  if (result.loading) return <p className="muted">Loading…</p>
  if (result.ok === false) return <QueryError what="this chapter" error={result.error} />
  if (result.data === null) return <p className="muted">Chapter not found.</p>

  const { chapter, scenes, wordcount, uncounted } = result.data
  return (
    <article className="chapter-overview">
      <header>
        <p className="muted">{chapter.work.title}</p>
        <h1>
          Chapter {chapter.number}: {chapter.title}
        </h1>
        <p>
          <Status value={chapter.status} />
          {chapter.postedDate && <span className="muted"> on {chapter.postedDate}</span>}
        </p>
      </header>

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
              <tr key={scene.id}>
                <td className="num">{scene.position}</td>
                <td>{scene.title}</td>
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
