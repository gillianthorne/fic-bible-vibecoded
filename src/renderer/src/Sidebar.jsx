import { useQuery } from './useQuery.js'
import { QueryError } from './QueryError.jsx'

// Minimal for now: works and their chapters, enough to pick a chapter.
// The full tree (scenes, creating things) comes later.
export default function Sidebar({ selectedChapterId, onSelectChapter }) {
  const tree = useQuery(() => window.ficBible.navigationTree(), 'tree')

  return (
    <nav className="sidebar" aria-label="Works and chapters">
      {tree.loading && <p className="muted">Loading…</p>}
      {tree.ok === false && <QueryError what="the library" error={tree.error} />}
      {tree.ok && tree.data.length === 0 && <p className="muted">No works yet.</p>}
      {tree.ok &&
        tree.data.map((work) => (
          <section key={work.id} className="sidebar-work">
            <h2>{work.title}</h2>
            {work.chapters.length === 0 ? (
              <p className="muted">No chapters</p>
            ) : (
              <ul>
                {work.chapters.map((chapter) => (
                  <li key={chapter.id}>
                    <button
                      type="button"
                      className={chapter.id === selectedChapterId ? 'selected' : undefined}
                      aria-current={chapter.id === selectedChapterId ? 'page' : undefined}
                      onClick={() => onSelectChapter(chapter.id)}
                    >
                      <span className="chapter-number">{chapter.number}.</span> {chapter.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
    </nav>
  )
}
