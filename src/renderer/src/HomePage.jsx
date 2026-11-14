import { useQuery } from './useQuery.js'
import { QueryError } from './QueryError.jsx'
import { number } from './labels.jsx'
import { ExternalLink } from './Notes.jsx'

// The app's home page: the total wordcount across every work, then every
// work as a table. Wordcounts come from the scene files, read by the main
// process on every load. Clicking a work's row opens its overview.

const words = (n) => `${number(n)} ${n === 1 ? 'word' : 'words'}`

export default function HomePage({ refreshKey, onOpenWork }) {
  const result = useQuery(() => window.ficBible.libraryOverview(), 'home', refreshKey)

  if (result.loading) return <p className="muted">Loading…</p>
  if (result.ok === false) return <QueryError what="the library" error={result.error} />

  const { works, wordcount, uncounted } = result.data
  return (
    <article className="home-page">
      <header>
        <h1>Your fics</h1>
        <p className="muted">
          {words(wordcount)} across {works.length} {works.length === 1 ? 'work' : 'works'}
          {uncounted > 0 && (
            <span className="file-error">
              {' '}
              ({uncounted} {uncounted === 1 ? 'scene' : 'scenes'} not counted)
            </span>
          )}
        </p>
      </header>

      {works.length === 0 ? (
        <p className="muted">No works yet. Choose a library folder in the sidebar to import one.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th className="num">Chapters</th>
              <th className="num">Words</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            {works.map((work) => (
              <tr key={work.id} onClick={() => onOpenWork(work.id)}>
                <td>
                  {/* No handler of its own: its click reaches the row's.
                      The button makes the row reachable by keyboard. */}
                  <button type="button" className="link-button scene-link">
                    {work.title}
                  </button>
                </td>
                <td className="num">{work.chapterCount}</td>
                <td className="num">
                  {number(work.wordcount)}
                  {work.uncounted > 0 && (
                    <span className="file-error" title={`${work.uncounted} scene files couldn’t be read`}>
                      {' '}
                      *
                    </span>
                  )}
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  {work.url ? <ExternalLink href={work.url}>Open ↗</ExternalLink> : <span className="muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  )
}
