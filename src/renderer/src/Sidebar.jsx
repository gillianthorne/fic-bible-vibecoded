import { useQuery } from './useQuery.js'
import { QueryError } from './QueryError.jsx'

// The navigation tree: works, expanding to chapters, expanding to scenes.
// Clicking a chapter opens its overview and clicking a scene opens its
// detail. Works have no screen of their own, so clicking one only folds it.
//
// Built as nested lists with disclosure buttons (aria-expanded), not an
// ARIA tree: role="tree" promises arrow-key navigation, which v1 doesn't
// have. Which rows are open is owned by App (isExpanded / onToggle).

function Disclosure({ open, label, onToggle }) {
  return (
    <button
      type="button"
      className="tree-toggle"
      aria-expanded={open}
      aria-label={`${open ? 'Hide' : 'Show'} ${label}`}
      onClick={onToggle}
    >
      <span aria-hidden="true">{open ? '▾' : '▸'}</span>
    </button>
  )
}

function Item({ kind, id, selection, onSelect, className, children }) {
  const selected = selection?.kind === kind && selection.id === id
  return (
    <button
      type="button"
      className={['tree-item', className, selected && 'selected'].filter(Boolean).join(' ')}
      aria-current={selected ? 'page' : undefined}
      onClick={() => onSelect({ kind, id })}
    >
      {children}
    </button>
  )
}

function Scene({ scene, selection, onSelect }) {
  return (
    <li>
      <Item kind="scene" id={scene.id} selection={selection} onSelect={onSelect} className="tree-scene">
        <span className="tree-number">{scene.position}.</span> {scene.title}
      </Item>
    </li>
  )
}

function Chapter({ chapter, selection, onSelect, isExpanded, onToggle }) {
  const key = `chapter:${chapter.id}`
  const open = isExpanded(key)
  return (
    <li>
      <div className="tree-row">
        <Disclosure open={open} label={`scenes in chapter ${chapter.number}`} onToggle={() => onToggle(key)} />
        <Item kind="chapter" id={chapter.id} selection={selection} onSelect={onSelect}>
          <span className="tree-number">{chapter.number}.</span> {chapter.title}
        </Item>
      </div>
      {open &&
        (chapter.scenes.length === 0 ? (
          <p className="tree-empty muted">No scenes</p>
        ) : (
          <ul className="tree-scenes">
            {chapter.scenes.map((scene) => (
              <Scene key={scene.id} scene={scene} selection={selection} onSelect={onSelect} />
            ))}
          </ul>
        ))}
    </li>
  )
}

function Work({ work, selection, onSelect, isExpanded, onToggle }) {
  const key = `work:${work.id}`
  const open = isExpanded(key)
  return (
    <li className="tree-work">
      <h2>
        <button type="button" className="tree-work-title" aria-expanded={open} onClick={() => onToggle(key)}>
          <span className="tree-toggle-mark" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>{' '}
          {work.title}
        </button>
      </h2>
      {open &&
        (work.chapters.length === 0 ? (
          <p className="tree-empty muted">No chapters</p>
        ) : (
          <ul className="tree-chapters">
            {work.chapters.map((chapter) => (
              <Chapter
                key={chapter.id}
                chapter={chapter}
                selection={selection}
                onSelect={onSelect}
                isExpanded={isExpanded}
                onToggle={onToggle}
              />
            ))}
          </ul>
        ))}
    </li>
  )
}

export default function Sidebar({ selection, onSelect, isExpanded, onToggle }) {
  const tree = useQuery(() => window.ficBible.navigationTree(), 'tree')

  return (
    <nav className="sidebar" aria-label="Works, chapters and scenes">
      {tree.loading && <p className="muted">Loading…</p>}
      {tree.ok === false && <QueryError what="the library" error={tree.error} />}
      {tree.ok && tree.data.length === 0 && <p className="muted">No works yet.</p>}
      {tree.ok && tree.data.length > 0 && (
        <ul className="tree">
          {tree.data.map((work) => (
            <Work
              key={work.id}
              work={work}
              selection={selection}
              onSelect={onSelect}
              isExpanded={isExpanded}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </nav>
  )
}
