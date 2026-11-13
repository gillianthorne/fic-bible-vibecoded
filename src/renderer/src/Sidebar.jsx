import { useQuery } from './useQuery.js'
import { QueryError } from './QueryError.jsx'

// Minimal for now: works, their chapters and each chapter's scenes, enough
// to pick one. The full tree (scene status, collapsing, creating things)
// comes later.

function Item({ kind, id, selection, onSelect, className, children }) {
  const selected = selection?.kind === kind && selection.id === id
  return (
    <button
      type="button"
      className={[className, selected && 'selected'].filter(Boolean).join(' ') || undefined}
      aria-current={selected ? 'page' : undefined}
      onClick={() => onSelect({ kind, id })}
    >
      {children}
    </button>
  )
}

export default function Sidebar({ selection, onSelect }) {
  const tree = useQuery(() => window.ficBible.navigationTree(), 'tree')

  return (
    <nav className="sidebar" aria-label="Works, chapters and scenes">
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
                    <Item kind="chapter" id={chapter.id} selection={selection} onSelect={onSelect}>
                      <span className="chapter-number">{chapter.number}.</span> {chapter.title}
                    </Item>
                    {chapter.scenes.length > 0 && (
                      <ul className="sidebar-scenes">
                        {chapter.scenes.map((scene) => (
                          <li key={scene.id}>
                            <Item
                              kind="scene"
                              id={scene.id}
                              selection={selection}
                              onSelect={onSelect}
                              className="sidebar-scene"
                            >
                              <span className="chapter-number">{scene.position}.</span> {scene.title}
                            </Item>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
    </nav>
  )
}
