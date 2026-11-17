import { useQuery } from './useQuery.js'
import { QueryError } from './QueryError.jsx'

// Every character, in every work, whose name, age, birthday, fields or
// notes hold the search text (spec: Search). Grouped by work; each result
// shows what matched. Clicking a character opens their profile.

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// The value with each case-insensitive occurrence of `query` marked.
function Highlight({ text, query }) {
  const lower = text.toLowerCase()
  const needle = query.toLowerCase()
  const parts = []
  let from = 0
  for (let at = lower.indexOf(needle); at !== -1 && needle; at = lower.indexOf(needle, from)) {
    if (at > from) parts.push(text.slice(from, at))
    parts.push(<mark key={at}>{text.slice(at, at + needle.length)}</mark>)
    from = at + needle.length
  }
  parts.push(text.slice(from))
  return <>{parts}</>
}

export default function SearchResults({ query, refreshKey, onOpenCharacter }) {
  const result = useQuery(() => window.ficBible.searchCharacters(query), query, refreshKey)

  if (result.loading) return <p className="muted">Searching…</p>
  if (result.ok === false) return <QueryError what="the search" error={result.error} />

  const { works, unreadable } = result.data
  const count = works.reduce((sum, w) => sum + w.characters.length, 0)
  return (
    <article className="search-results">
      <header>
        <p className="muted">Search characters</p>
        <h1>“{result.data.query}”</h1>
        <p role="status">
          {count === 0 ? 'No characters match.' : `${plural(count, 'character', 'characters')} in ${plural(works.length, 'work', 'works')}`}
        </p>
      </header>

      {works.map((work) => (
        <section key={work.id} aria-label={work.title}>
          <h2>{work.title}</h2>
          <ul className="search-list">
            {work.characters.map((c) => (
              <li key={c.id}>
                <button type="button" className="link-button search-name" onClick={() => onOpenCharacter(c.id, work.id)}>
                  {c.name}
                </button>
                <dl className="search-matches">
                  {c.matches
                    .filter((m) => m.where !== 'name')
                    .map((m, i) => (
                      <div key={i}>
                        <dt>
                          <Highlight text={m.label} query={result.data.query} />
                        </dt>
                        <dd>
                          <Highlight text={m.value} query={result.data.query} />
                        </dd>
                      </div>
                    ))}
                </dl>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {unreadable.length > 0 && (
        <p className="file-error">
          {plural(unreadable.length, 'notes file', 'notes files')} couldn’t be read, so{' '}
          {unreadable.length === 1 ? 'it wasn’t' : 'they weren’t'} searched:{' '}
          {unreadable.map((u) => `${u.filename} (${u.error})`).join(', ')}.
        </p>
      )}
    </article>
  )
}
