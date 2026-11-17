import { useState } from 'react'
import { useQuery } from './useQuery.js'
import { QueryError } from './QueryError.jsx'
import LibraryBar from './LibraryBar.jsx'

// The navigation tree: works, each holding three groups, Characters,
// Notes and Chapters; chapters expand to scenes. Clicking a work opens its overview,
// a character their profile, a chapter its overview, and a scene its
// detail. Home, above the tree, opens the home page.
//
// Built as nested lists with disclosure buttons (aria-expanded), not an
// ARIA tree: role="tree" promises arrow-key navigation, which v1 doesn't
// have. Which rows are open is owned by App (isExpanded / onToggle).
//
// "+ New work / chapter / scene" add one at the end: a title box opens in
// place, Enter creates it (a row plus its empty folder or file), Escape
// cancels. They're hidden for a test library, which can't be changed.
//
// Each work has a Hide button, shown on hover or focus. Hidden works move
// to a Hidden works group at the bottom, folded by default, where they open
// as usual and have Unhide instead. Hiding changes only the database, so
// it works on a test library too.
//
// Titles are one line, cut with an ellipsis; the full title is in the
// row's tooltip. A collapsed row that hides the open item is marked, so the
// selection can't vanish by folding its parent.

const isSelected = (selection, kind, id) => selection?.kind === kind && selection.id === id

const chapterHolds = (chapter, selection) =>
  isSelected(selection, 'chapter', chapter.id) ||
  (selection?.kind === 'scene' && chapter.scenes.some((s) => s.id === selection.id))

// Whether the open item is this work or anything inside it.
const workHolds = (work, selection) =>
  isSelected(selection, 'work', work.id) ||
  work.characters.some((c) => isSelected(selection, 'character', c.id)) ||
  work.chapters.some((ch) => chapterHolds(ch, selection)) ||
  notesHold(work, selection)

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
function NewItem({ what, label = 'title', create, onCreated, className }) {
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
        aria-label={`New ${what} ${label}`}
        placeholder={`New ${what} ${label}`}
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
          onCreated={(id) => onCreated({ kind: 'scene', id }, [`work:${workId}`, `chapters:${workId}`, `chapter:${chapter.id}`])}
        />
      )}
    </li>
  )
}

// One of a work's two groups, Characters and Chapters: a heading that
// folds and unfolds, not a link, since neither has a screen of its own.
function Group({ groupKey, label, count, hidesSelection, isExpanded, onToggle, children }) {
  const open = isExpanded(groupKey)
  return (
    <li className="tree-group">
      <div className={['tree-row', !open && hidesSelection && 'hides-selection'].filter(Boolean).join(' ')}>
        <button type="button" className="tree-group-title" aria-expanded={open} onClick={() => onToggle(groupKey)}>
          <span className="tree-toggle-mark" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
          <span className="tree-title">{label}</span>
          {count !== null && <span className="tree-count">{count}</span>}
          {!open && hidesSelection && <HiddenSelection />}
        </button>
      </div>
      {open && <div className="tree-group-body">{children}</div>}
    </li>
  )
}

function Characters({ work, selection, onSelect, isExpanded, onToggle, canCreate, onCreated }) {
  const groupKey = `characters:${work.id}`
  return (
    <Group
      groupKey={groupKey}
      label="Characters"
      count={work.characters.length}
      hidesSelection={work.characters.some((c) => isSelected(selection, 'character', c.id))}
      isExpanded={isExpanded}
      onToggle={onToggle}
    >
      {work.characters.length === 0 ? (
        <p className="tree-empty muted">No characters</p>
      ) : (
        <ul className="tree-characters">
          {work.characters.map((c) => (
            <li key={c.id} title={c.name}>
              <Item kind="character" id={c.id} selection={selection} onSelect={onSelect} className="tree-character">
                <span className="tree-title">{c.name}</span>
              </Item>
            </li>
          ))}
        </ul>
      )}
      {canCreate && (
        <NewItem
          what="character"
          label="name"
          className="tree-new-character"
          create={(name) => window.ficBible.createCharacter(work.id, name)}
          onCreated={(id) => onCreated({ kind: 'character', id }, [`work:${work.id}`, groupKey])}
        />
      )}
    </Group>
  )
}

// The work's notes: its line dictionary, its timeline, and its freeform
// note pages in the author's order.
function Notes({ work, selection, onSelect, isExpanded, onToggle, canCreate, onCreated }) {
  const groupKey = `notes:${work.id}`
  return (
    <Group
      groupKey={groupKey}
      label="Notes"
      count={null}
      hidesSelection={notesHold(work, selection)}
      isExpanded={isExpanded}
      onToggle={onToggle}
    >
      <ul className="tree-characters">
        <li>
          <Item kind="lines" id={work.id} selection={selection} onSelect={onSelect} className="tree-character">
            <span className="tree-title">Lines</span>
          </Item>
        </li>
        <li>
          <Item kind="timeline" id={work.id} selection={selection} onSelect={onSelect} className="tree-character">
            <span className="tree-title">Timeline</span>
          </Item>
        </li>
        {work.notePages.map((p) => (
          <li key={p.id} title={p.name}>
            <Item kind="notePage" id={p.id} selection={selection} onSelect={onSelect} className="tree-character tree-note-page">
              <span className="tree-title">{p.name}</span>
            </Item>
          </li>
        ))}
      </ul>
      {canCreate && (
        <NewItem
          what="page"
          label="name"
          className="tree-new-character"
          create={(name) => window.ficBible.createNotePage(work.id, name)}
          onCreated={(id) => onCreated({ kind: 'notePage', id }, [`work:${work.id}`, groupKey])}
        />
      )}
    </Group>
  )
}

const notesHold = (work, selection) =>
  isSelected(selection, 'lines', work.id) ||
  isSelected(selection, 'timeline', work.id) ||
  work.notePages.some((p) => isSelected(selection, 'notePage', p.id))

// Clicking a work opens its overview and unfolds it. Clicking it again
// while its overview is open folds or unfolds it.
function Work({ work, selection, onSelect, isExpanded, onToggle, canCreate, onCreated, onSetHidden }) {
  const key = `work:${work.id}`
  const open = isExpanded(key)
  const selected = isSelected(selection, 'work', work.id)
  const holdsCharacter = work.characters.some((c) => isSelected(selection, 'character', c.id))
  const holdsChapter = work.chapters.some((ch) => chapterHolds(ch, selection))
  const hidesSelection = !open && (holdsCharacter || holdsChapter || notesHold(work, selection))
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
        <button
          type="button"
          className="tree-hide"
          aria-label={`${work.hidden ? 'Unhide' : 'Hide'} ${work.title}`}
          title={work.hidden ? 'Show this work in the list again' : 'Move this work to Hidden works'}
          onClick={() => onSetHidden(work.id, !work.hidden)}
        >
          {work.hidden ? 'Unhide' : 'Hide'}
        </button>
      </h2>
      {open && (
        <ul className="tree-groups">
          <Characters
            work={work}
            selection={selection}
            onSelect={onSelect}
            isExpanded={isExpanded}
            onToggle={onToggle}
            canCreate={canCreate}
            onCreated={onCreated}
          />
          <Notes
            work={work}
            selection={selection}
            onSelect={onSelect}
            isExpanded={isExpanded}
            onToggle={onToggle}
            canCreate={canCreate}
            onCreated={onCreated}
          />
          <Group
            groupKey={`chapters:${work.id}`}
            label="Chapters"
            count={work.chapters.length}
            hidesSelection={holdsChapter}
            isExpanded={isExpanded}
            onToggle={onToggle}
          >
            {work.chapters.length === 0 ? (
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
            )}
            {canCreate && (
              <NewItem
                what="chapter"
                className="tree-new-chapter"
                create={(title) => window.ficBible.createChapter(work.id, title)}
                onCreated={(id) => onCreated({ kind: 'chapter', id }, [`work:${work.id}`, `chapters:${work.id}`])}
              />
            )}
          </Group>
        </ul>
      )}
    </li>
  )
}

function WorkList({ works, ...props }) {
  return (
    <ul className="tree">
      {works.map((work) => (
        <Work key={work.id} work={work} {...props} />
      ))}
    </ul>
  )
}

// Folded by default. Folded, it's marked if the open item is inside it.
function HiddenWorks({ works, selection, isExpanded, onToggle, ...props }) {
  const key = 'hidden-works'
  const open = isExpanded(key)
  const hidesSelection = !open && works.some((w) => workHolds(w, selection))
  return (
    <section className="tree-hidden-works">
      <h2>
        <button
          type="button"
          className={['tree-work-title', hidesSelection && 'hides-selection'].filter(Boolean).join(' ')}
          aria-expanded={open}
          onClick={() => onToggle(key)}
        >
          <span className="tree-toggle-mark" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
          <span className="tree-title">Hidden works</span>
          <span className="tree-count">{works.length}</span>
          {hidesSelection && <HiddenSelection />}
        </button>
      </h2>
      {open && <WorkList works={works} selection={selection} isExpanded={isExpanded} onToggle={onToggle} {...props} />}
    </section>
  )
}

// refreshKey changes after an import, so the tree is read again.
// onCreated(selection, expandKeys) runs after something is created: App
// reads the library again, unfolds expandKeys and opens the new item.
// onChanged runs after hiding or unhiding a work, so every screen reads
// the library again.
export default function Sidebar({ selection, onSelect, isExpanded, onToggle, refreshKey, onImported, onCreated, onChanged }) {
  const tree = useQuery(() => window.ficBible.navigationTree(), `tree:${refreshKey}`)
  const info = useQuery(() => window.ficBible.libraryInfo(), 'library-info', refreshKey)
  const canCreate = info.ok === true && info.data.canChange
  const [hideError, setHideError] = useState(null)

  async function setHidden(workId, hidden) {
    setHideError(null)
    const result = await window.ficBible.updateWork(workId, { hidden })
    if (result.ok) onChanged()
    else setHideError(result.error)
  }

  const shown = tree.ok ? tree.data.filter((w) => !w.hidden) : []
  const hidden = tree.ok ? tree.data.filter((w) => w.hidden) : []
  const listProps = { selection, onSelect, isExpanded, onToggle, canCreate, onCreated, onSetHidden: setHidden }

  return (
    <nav className="sidebar" aria-label="Works, characters, chapters and scenes">
      <LibraryBar refreshKey={refreshKey} onImported={onImported} />
      <Item kind="home" selection={selection} onSelect={onSelect} className="tree-home">
        <span className="tree-title">Home</span>
      </Item>
      {tree.loading && <p className="muted">Loading…</p>}
      {tree.ok === false && <QueryError what="the library" error={tree.error} />}
      {hideError && (
        <p className="tree-new-error" role="alert">
          {hideError}
        </p>
      )}
      {tree.ok && tree.data.length === 0 && <p className="muted">No works yet.</p>}
      {tree.ok && tree.data.length > 0 && shown.length === 0 && <p className="muted">Every work is hidden.</p>}
      {shown.length > 0 && <WorkList works={shown} {...listProps} />}
      {tree.ok && canCreate && (
        <NewItem
          what="work"
          className="tree-new-work"
          create={(title) => window.ficBible.createWork(title)}
          onCreated={(id) => onCreated({ kind: 'work', id }, [`work:${id}`])}
        />
      )}
      {hidden.length > 0 && <HiddenWorks works={hidden} {...listProps} />}
    </nav>
  )
}
