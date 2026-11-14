import { useState } from 'react'
import { useQuery } from './useQuery.js'
import { QueryError } from './QueryError.jsx'
import LibraryBar from './LibraryBar.jsx'

// The navigation tree: works, expanding to chapters, expanding to scenes.
// Clicking a work opens its overview, a chapter its overview, and a scene
// its detail. Home, above the tree, opens the home page.
//
// Built as nested lists with disclosure buttons (aria-expanded), not an
// ARIA tree: role="tree" promises arrow-key navigation, which v1 doesn't
// have. Which rows are open is owned by App (isExpanded / onToggle).
//
// "+ New work / chapter / scene" add one at the end: a title box opens in
// place, Enter creates it (a row plus its empty folder or file), Escape
// cancels. They're hidden for a test library, which can't be changed.
//
// Titles are one line, cut with an ellipsis; the full title is in the
// row's tooltip. A collapsed row that hides the open item is marked, so the
// selection can't vanish by folding its parent.

const isSelected = (selection, kind, id) => selection?.kind === kind && selection.id === id

const chapterHolds = (chapter, selection) =>
  isSelected(selection, 'chapter', chapter.id) ||
  (selection?.kind === 'scene' && chapter.scenes.some((s) => s.id === selection.id))

function HiddenSelection() {
  return <span className="visually-hidden">(contains the open item)</span>
}

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
  const selected = isSelected(selection, kind, id)
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

// A dot rather than the full status label, which wouldn't fit beside a
// title. The status is also given as text, so it doesn't rest on colour.
function StatusDot({ status }) {
  return (
    <>
      <span className={`status-dot status-dot-${status.replace(/\s+/g, '-')}`} aria-hidden="true" />
      <span className="visually-hidden">({status})</span>
    </>
  )
}

// A "+ New …" entry that opens into a title box. create(title) resolves
// to { ok, data: newId } or { ok: false, error }; onCreated(newId) runs
// after a successful create. A failed create keeps the box open with the
// error under it.
function NewItem({ what, create, onCreated, className }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  function close() {
    setOpen(false)
    setTitle('')
    setError(null)
  }

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await create(title)
      if (result.ok) {
        close()
        onCreated(result.data)
      } else setError(result.error)
    } catch (err) {
      setError(String(err?.message ?? err))
    } finally {
      setBusy(false)
    }
  }

  const classes = (base) => [base, className].filter(Boolean).join(' ')
  if (!open) {
    return (
      <button type="button" className={classes('tree-new')} onClick={() => setOpen(true)}>
        + New {what}
      </button>
    )
  }
  return (
    <form className={classes('tree-new-form')} onSubmit={submit}>
      <input
        type="text"
        value={title}
        aria-label={`New ${what} title`}
        placeholder={`New ${what} title`}
        autoFocus
        disabled={busy}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && close()}
      />
      {error && (
        <p className="tree-new-error" role="alert">
          {error}
        </p>
      )}
      <p className="tree-new-hint">Enter to create · Esc to cancel</p>
    </form>
  )
}

function Scene({ scene, selection, onSelect }) {
  return (
    <li title={`${scene.title} (${scene.status})`}>
      <Item kind="scene" id={scene.id} selection={selection} onSelect={onSelect} className="tree-scene">
        <StatusDot status={scene.status} />
        <span className="tree-number">{scene.position}.</span>
        <span className="tree-title">{scene.title}</span>
      </Item>
    </li>
  )
}

function Chapter({ chapter, workId, selection, onSelect, isExpanded, onToggle, canCreate, onCreated }) {
  const key = `chapter:${chapter.id}`
  const open = isExpanded(key)
  // The chapter's own row shows its selection; this is for a hidden scene.
  const hidesSelection =
    !open && selection?.kind === 'scene' && chapter.scenes.some((s) => s.id === selection.id)
  return (
    <li>
      <div className={['tree-row', hidesSelection && 'hides-selection'].filter(Boolean).join(' ')} title={chapter.title}>
        <Disclosure open={open} label={`scenes in chapter ${chapter.number}`} onToggle={() => onToggle(key)} />
        <Item kind="chapter" id={chapter.id} selection={selection} onSelect={onSelect}>
          <span className="tree-number">{chapter.number}.</span>
          <span className="tree-title">{chapter.title}</span>
          {hidesSelection && <HiddenSelection />}
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
      {open && canCreate && (
        <NewItem
          what="scene"
          className="tree-new-scene"
          create={(title) => window.ficBible.createScene(chapter.id, title)}
          onCreated={(id) => onCreated({ kind: 'scene', id }, [`work:${workId}`, `chapter:${chapter.id}`])}
        />
      )}
    </li>
  )
}

// Clicking a work opens its overview and unfolds it. Clicking it again
// while its overview is open folds or unfolds it.
function Work({ work, selection, onSelect, isExpanded, onToggle, canCreate, onCreated }) {
  const key = `work:${work.id}`
  const open = isExpanded(key)
  const selected = isSelected(selection, 'work', work.id)
  const hidesSelection = !open && work.chapters.some((ch) => chapterHolds(ch, selection))
  function click() {
    if (selected || !open) onToggle(key)
    if (!selected) onSelect({ kind: 'work', id: work.id })
  }
  return (
    <li className="tree-work">
      <h2>
        <button
          type="button"
          className={['tree-work-title', selected && 'selected', hidesSelection && 'hides-selection']
            .filter(Boolean)
            .join(' ')}
          aria-expanded={open}
          aria-current={selected ? 'page' : undefined}
          title={work.title}
          onClick={click}
        >
          <span className="tree-toggle-mark" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
          <span className="tree-title">{work.title}</span>
          {hidesSelection && <HiddenSelection />}
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
                workId={work.id}
                selection={selection}
                onSelect={onSelect}
                isExpanded={isExpanded}
                onToggle={onToggle}
                canCreate={canCreate}
                onCreated={onCreated}
              />
            ))}
          </ul>
        ))}
      {open && canCreate && (
        <NewItem
          what="chapter"
          className="tree-new-chapter"
          create={(title) => window.ficBible.createChapter(work.id, title)}
          onCreated={(id) => onCreated({ kind: 'chapter', id }, [`work:${work.id}`])}
        />
      )}
    </li>
  )
}

// refreshKey changes after an import, so the tree is read again.
// onCreated(selection, expandKeys) runs after something is created: App
// reads the library again, unfolds expandKeys and opens the new item.
export default function Sidebar({ selection, onSelect, isExpanded, onToggle, refreshKey, onImported, onCreated }) {
  const tree = useQuery(() => window.ficBible.navigationTree(), `tree:${refreshKey}`)
  const info = useQuery(() => window.ficBible.libraryInfo(), 'library-info', refreshKey)
  const canCreate = info.ok === true && info.data.canChange

  return (
    <nav className="sidebar" aria-label="Works, chapters and scenes">
      <LibraryBar refreshKey={refreshKey} onImported={onImported} />
      <Item kind="home" selection={selection} onSelect={onSelect} className="tree-home">
        <span className="tree-title">Home</span>
      </Item>
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
              canCreate={canCreate}
              onCreated={onCreated}
            />
          ))}
        </ul>
      )}
      {tree.ok && canCreate && (
        <NewItem
          what="work"
          className="tree-new-work"
          create={(title) => window.ficBible.createWork(title)}
          onCreated={(id) => onCreated({ kind: 'work', id }, [`work:${id}`])}
        />
      )}
    </nav>
  )
}
