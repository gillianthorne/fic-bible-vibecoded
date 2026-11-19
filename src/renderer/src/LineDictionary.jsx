import { useState } from 'react'
import { useQuery } from './useQuery.js'
import { QueryError } from './QueryError.jsx'
import { Status } from './labels.jsx'
import { DeleteButton, EditButton, Field, FormActions, SaveError, Select, SuggestInput, useSave } from './editing.jsx'

// A work's line dictionary (spec: Line dictionary): every planned or
// written line, grouped by type, sortable by any column. A used line's
// chapter and scene are links. Every change is saved straight away, then
// onChanged() reads the dictionary again.

export const LINE_STATUSES = ['planned', 'used', 'dropped']
const STATUS_ORDER = Object.fromEntries(LINE_STATUSES.map((s, i) => [s, i]))

// Sorting lasts until the app closes and isn't stored (spec), so it lives
// here, per work, rather than in the database or the component.
const sortByWork = new Map()
const groupByWork = new Map()

const chapterLabel = (ch) => `${ch.number}. ${ch.title}`
const sceneLabel = (s) => `${s.position}. ${s.title}`
const beatLabel = (b) => `${b.position}. ${b.kind}: ${b.content.length > 50 ? `${b.content.slice(0, 50)}…` : b.content}`

const compareText = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })
// Lines with no chapter or scene sort after those with one, either way.
const place = (l) => [l.chapter?.number ?? Infinity, l.scene?.position ?? Infinity]

const COLUMNS = [
  ['line', 'Line', (a, b) => compareText(a.line, b.line)],
  ['type', 'Type', (a, b) => compareText(a.type, b.type)],
  ['speaker', 'Speaker', (a, b) => compareText(a.speaker, b.speaker)],
  ['chapter', 'Chapter', (a, b) => place(a)[0] - place(b)[0] || place(a)[1] - place(b)[1]],
  ['scene', 'Scene', (a, b) => place(a)[0] - place(b)[0] || place(a)[1] - place(b)[1]],
  ['status', 'Status', (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]],
  ['notes', 'Notes', (a, b) => compareText(a.notes ?? '', b.notes ?? '')]
]

function sorted(lines, sort) {
  if (!sort) return lines
  const compare = COLUMNS.find(([key]) => key === sort.key)[2]
  // Stable, so equal lines keep the default order.
  return [...lines].sort((a, b) => (sort.dir === 'asc' ? compare(a, b) : compare(b, a)))
}

// Used for a new line and for editing one. The scene list follows the
// chapter, and the beat list the scene; changing one clears what's below.
function LineForm({ initial, chapters, suggestions, busy, error, onSubmit, onCancel, saveLabel }) {
  const [line, setLine] = useState(initial.line)
  const [type, setType] = useState(initial.type)
  const [speaker, setSpeaker] = useState(initial.speaker)
  const [chapterId, setChapterId] = useState(initial.chapter?.id ?? null)
  const [sceneId, setSceneId] = useState(initial.scene?.id ?? null)
  const [beatId, setBeatId] = useState(initial.beat?.id ?? null)
  const [status, setStatus] = useState(initial.status)
  const [notes, setNotes] = useState(initial.notes ?? '')

  const chapter = chapters.find((c) => c.id === chapterId)
  const scene = chapter?.scenes.find((s) => s.id === sceneId)
  const toId = (v) => (v === '' ? null : Number(v))

  function submit(e) {
    e.preventDefault()
    onSubmit({ line, type, speaker, chapterId, sceneId, beatId, status, notes })
  }

  return (
    <form className="edit-form" onSubmit={submit}>
      <Field label="Line" wide>
        {(id) => <textarea id={id} rows={2} value={line} required autoFocus onChange={(e) => setLine(e.target.value)} />}
      </Field>
      <div className="edit-row">
        <Field label="Type">{(id) => <SuggestInput id={id} value={type} onChange={setType} options={suggestions.types} />}</Field>
        <Field label="Speaker">
          {(id) => <SuggestInput id={id} value={speaker} onChange={setSpeaker} options={suggestions.speakers} />}
        </Field>
        <Field label="Status">{(id) => <Select id={id} value={status} onChange={setStatus} options={LINE_STATUSES} />}</Field>
      </div>
      <div className="edit-row">
        <Field label="Chapter">
          {(id) => (
            <select
              id={id}
              value={chapterId ?? ''}
              onChange={(e) => {
                setChapterId(toId(e.target.value))
                setSceneId(null)
                setBeatId(null)
              }}
            >
              <option value="">None yet</option>
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {chapterLabel(c)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Scene">
          {(id) => (
            <select
              id={id}
              value={sceneId ?? ''}
              disabled={!chapter}
              onChange={(e) => {
                setSceneId(toId(e.target.value))
                setBeatId(null)
              }}
            >
              <option value="">None yet</option>
              {chapter?.scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {sceneLabel(s)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Beat">
          {(id) => (
            <select id={id} value={beatId ?? ''} disabled={!scene} onChange={(e) => setBeatId(toId(e.target.value))}>
              <option value="">None</option>
              {scene?.beats.map((b) => (
                <option key={b.id} value={b.id}>
                  {beatLabel(b)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <Field label="Notes" wide>
        {(id) => <textarea id={id} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}
      </Field>
      <SaveError error={error} />
      <FormActions busy={busy} onCancel={onCancel} saveLabel={saveLabel} />
    </form>
  )
}

// A chapter or scene: a link when the line is used (spec), text otherwise.
function Place({ label, used, onOpen }) {
  if (!label) return <span className="muted">—</span>
  if (!used) return label
  return (
    <button type="button" className="link-button" onClick={onOpen}>
      {label}
    </button>
  )
}

function LineRow({ line, workId, showType, columnCount, chapters, suggestions, onChanged, onOpenChapter, onOpenScene }) {
  const [mode, setMode] = useState('view') // 'view' | 'edit' | 'confirm-delete'
  const { busy, error, save, clearError } = useSave()
  const done = () => {
    setMode('view')
    onChanged()
  }

  if (mode === 'edit') {
    return (
      <tr className="edit-note-editing">
        <td colSpan={columnCount}>
          <LineForm
            initial={line}
            chapters={chapters}
            suggestions={suggestions}
            busy={busy}
            error={error}
            onSubmit={(fields) => save(() => window.ficBible.updateLine(line.id, fields), done)}
            onCancel={() => {
              clearError()
              setMode('view')
            }}
          />
        </td>
      </tr>
    )
  }

  const used = line.status === 'used'
  return (
    <>
      <tr className={`line-row line-${line.status}`}>
        <td className="line-text">{line.line}</td>
        {showType && <td>{line.type || <span className="muted">—</span>}</td>}
        <td>{line.speaker || <span className="muted">—</span>}</td>
        <td>
          <Place
            label={line.chapter && chapterLabel(line.chapter)}
            used={used}
            onOpen={() => onOpenChapter(line.chapter.id, workId)}
          />
        </td>
        <td>
          <Place
            label={line.scene && sceneLabel(line.scene)}
            used={used}
            onOpen={() => onOpenScene(line.scene.id, line.chapter.id, workId)}
          />
          {line.beat && (
            <span className="line-beat muted" title={line.beat.content}>
              beat {line.beat.position}
            </span>
          )}
        </td>
        <td>
          <Status value={line.status} />
        </td>
        <td className="line-notes">{line.notes ?? ''}</td>
        <td>
          <span className="edit-note-tools">
            <EditButton label="Edit line" onClick={() => setMode('edit')} disabled={busy} />
            <DeleteButton label="Delete line" onClick={() => setMode('confirm-delete')} disabled={busy} />
          </span>
        </td>
      </tr>
      {(mode === 'confirm-delete' || error) && (
        <tr>
          <td colSpan={columnCount}>
            {mode === 'confirm-delete' && (
              <div className="beat-confirm" role="alert">
                <span>Delete this line? This can’t be undone.</span>
                <button
                  type="button"
                  className="button-danger"
                  disabled={busy}
                  onClick={() => save(() => window.ficBible.deleteLine(line.id), done)}
                >
                  Delete
                </button>
                <button type="button" disabled={busy} onClick={() => setMode('view')}>
                  Cancel
                </button>
              </div>
            )}
            <SaveError error={error} />
          </td>
        </tr>
      )}
    </>
  )
}

function LineTable({ lines, showType, sort, onSort, ...rowProps }) {
  const columns = COLUMNS.filter(([key]) => showType || key !== 'type')
  const columnCount = columns.length + 1
  return (
    <div className="table-scroll">
      <table className="lines-table">
        <thead>
          <tr>
            {columns.map(([key, label]) => {
              const active = sort?.key === key
              return (
                <th
                  key={key}
                  className={`col-${key}`}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  <button type="button" className="sort-button" onClick={() => onSort(key)}>
                    {label}
                    <span className="sort-mark" aria-hidden="true">
                      {active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </span>
                  </button>
                </th>
              )
            })}
            <th className="col-tools">
              <span className="visually-hidden">Edit or delete</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted(lines, sort).map((line) => (
            <LineRow key={line.id} line={line} showType={showType} columnCount={columnCount} {...rowProps} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

const EMPTY_LINE = { line: '', type: '', speaker: '', chapter: null, scene: null, beat: null, status: 'planned', notes: null }

function AddLine({ workId, chapters, suggestions, onChanged }) {
  const [open, setOpen] = useState(false)
  const { busy, error, save, clearError } = useSave()
  if (!open) {
    return (
      <button type="button" className="add-beat" onClick={() => setOpen(true)}>
        + Add line
      </button>
    )
  }
  return (
    <div className="beat beat-editing">
      <div className="beat-body">
        <LineForm
          initial={EMPTY_LINE}
          chapters={chapters}
          suggestions={suggestions}
          busy={busy}
          error={error}
          saveLabel="Add line"
          onSubmit={(fields) =>
            save(
              () => window.ficBible.createLine(workId, fields),
              () => {
                setOpen(false)
                onChanged()
              }
            )
          }
          onCancel={() => {
            clearError()
            setOpen(false)
          }}
        />
      </div>
    </div>
  )
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

export default function LineDictionary({ workId, refreshKey, onChanged, onOpenChapter, onOpenScene }) {
  const result = useQuery(() => window.ficBible.lineDictionary(workId), workId, refreshKey)
  const [sort, setSortState] = useState(sortByWork.get(workId) ?? null)
  const [grouped, setGroupedState] = useState(groupByWork.get(workId) ?? true)

  if (result.loading) return <p className="muted">Loading…</p>
  if (result.ok === false) return <QueryError what="the line dictionary" error={result.error} />
  if (result.data === null) return <p className="muted">Work not found.</p>

  const { work, lines, chapters, suggestions } = result.data

  // Clicking a header sorts by it, again reverses, a third time goes back
  // to the default order.
  const onSort = (key) => {
    const next = sort?.key !== key ? { key, dir: 'asc' } : sort.dir === 'asc' ? { key, dir: 'desc' } : null
    sortByWork.set(workId, next)
    setSortState(next)
  }
  const setGrouped = (value) => {
    groupByWork.set(workId, value)
    setGroupedState(value)
  }

  const rowProps = { workId, chapters, suggestions, onChanged, onOpenChapter, onOpenScene, sort, onSort }
  // Lines arrive in type order, so a group is a run of the same type.
  const groups = []
  for (const line of lines) {
    if (groups.at(-1)?.type !== line.type) groups.push({ type: line.type, lines: [] })
    groups.at(-1).lines.push(line)
  }
  const usedCount = lines.filter((l) => l.status === 'used').length

  return (
    <article className="scene-detail line-dictionary">
      <header>
        <p className="muted">{work.title} · Notes</p>
        <h1>Lines</h1>
        <p className="muted">
          {lines.length === 0 ? 'No lines yet.' : `${plural(lines.length, 'line', 'lines')}, ${usedCount} used`}
        </p>
      </header>

      <div className="lines-controls">
        <AddLine workId={workId} chapters={chapters} suggestions={suggestions} onChanged={onChanged} />
        {lines.length > 0 && (
          <label className="lines-group-toggle">
            <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} /> Group by type
          </label>
        )}
      </div>

      {lines.length > 0 &&
        (grouped ? (
          groups.map((group) => (
            <section key={group.type} aria-label={group.type || 'No type'}>
              <h2>
                {group.type || <span className="muted">No type</span>}{' '}
                <span className="lines-count muted">{group.lines.length}</span>
              </h2>
              <LineTable lines={group.lines} showType={false} {...rowProps} />
            </section>
          ))
        ) : (
          <LineTable lines={lines} showType {...rowProps} />
        ))}
    </article>
  )
}
