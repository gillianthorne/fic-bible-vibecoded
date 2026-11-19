import { useQuery } from './useQuery.js'
import { QueryError } from './QueryError.jsx'

// Everything in every work that holds the search text: characters, notes
// and chapters (spec: Search). Tabs pick which; each shows its count.
// Grouped by work, and under Everything by kind within each work. Each
// result shows its name, highlighted where it matched, and what else
// matched. Clicking a result opens its screen.

// The menu beside the search box and the tabs here, in order. section is
// the key in each work of the search's result.
export const SEARCH_SCOPES = [
  { id: 'everything', label: 'Everything' },
  { id: 'characters', label: 'Characters', section: 'characters' },
  { id: 'notes', label: 'Notes', section: 'notes' },
  { id: 'chapters', label: 'Chapters', section: 'chapters' }
]
const SECTIONS = SEARCH_SCOPES.filter((s) => s.section)

const KIND_LABELS = {
  character: 'Character',
  line: 'Line',
  timeline: 'Timeline',
  notePage: 'Note page',
  chapter: 'Chapter',
  scene: 'Scene'
}

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

function Result({ result, query, onOpen }) {
  // A character's own name is the result; anything else says what it is.
  const context = result.kind === 'character' ? null : (result.context ?? KIND_LABELS[result.kind])
  return (
    <li>
      {context && <p className="search-context">{context}</p>}
      <button type="button" className="link-button search-name" onClick={onOpen}>
        <Highlight text={result.title} query={query} />
      </button>
      {result.matches.length > 0 && (
        <dl className="search-matches">
          {result.matches.map((m, i) => (
            <div key={i}>
              <dt>
                <Highlight text={m.label} query={query} />
              </dt>
              <dd>
                <Highlight text={m.value} query={query} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {result.moreProse > 0 && (
        <p className="search-more muted">and {plural(result.moreProse, 'more paragraph', 'more paragraphs')}</p>
      )}
    </li>
  )
}

export default function SearchResults({ query, scope = 'everything', refreshKey, onScope, onOpen }) {
  const result = useQuery(() => window.ficBible.search(query), query, refreshKey)

  if (result.loading) return <p className="muted">Searching…</p>
  if (result.ok === false) return <QueryError what="the search" error={result.error} />

  const { works, unreadable } = result.data
  const text = result.data.query
  const counts = Object.fromEntries(
    SECTIONS.map((s) => [s.id, works.reduce((sum, w) => sum + w[s.section].length, 0)])
  )
  counts.everything = SECTIONS.reduce((sum, s) => sum + counts[s.id], 0)
  const tab = SEARCH_SCOPES.find((s) => s.id === scope) ?? SEARCH_SCOPES[0]
  const shown = tab.section ? [tab] : SECTIONS
  const shownWorks = works.filter((w) => shown.some((s) => w[s.section].length > 0))

  return (
    <article className="search-results">
      <header>
        <p className="muted">Search</p>
        <h1>“{text}”</h1>
        <p role="status">
          {counts[tab.id] === 0
            ? 'Nothing matches.'
            : `${plural(counts[tab.id], 'result', 'results')} in ${plural(shownWorks.length, 'work', 'works')}`}
        </p>
      </header>

      <div className="search-tabs" role="tablist" aria-label="What to show">
        {SEARCH_SCOPES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === tab.id}
            className={s.id === tab.id ? 'search-tab current' : 'search-tab'}
            onClick={() => onScope(s.id)}
          >
            {s.label} <span className="search-count">{counts[s.id]}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {shownWorks.map((work) => (
          <section key={work.id} aria-label={work.title}>
            <h2>{work.title}</h2>
            {shown
              .filter((s) => work[s.section].length > 0)
              .map((s) => (
                <section key={s.id} aria-label={`${work.title}: ${s.label}`}>
                  {!tab.section && <h3>{s.label}</h3>}
                  <ul className="search-list">
                    {work[s.section].map((r) => (
                      <Result key={`${r.kind}:${r.id}`} result={r} query={text} onOpen={() => onOpen(r, work.id)} />
                    ))}
                  </ul>
                </section>
              ))}
          </section>
        ))}
      </div>

      {unreadable.length > 0 && (
        <p className="file-error">
          {plural(unreadable.length, 'file', 'files')} couldn’t be read, so{' '}
          {unreadable.length === 1 ? 'it wasn’t' : 'they weren’t'} searched:{' '}
          {unreadable.map((u) => `${u.filename} (${u.error})`).join(', ')}.
        </p>
      )}
    </article>
  )
}
