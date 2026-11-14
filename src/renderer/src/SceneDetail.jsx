import { useState } from 'react'
import { useQuery } from './useQuery.js'
import { QueryError } from './QueryError.jsx'
import { Status, Wordcount } from './labels.jsx'
import BeatList from './Beats.jsx'
import {
  Field,
  FormActions,
  NumberInput,
  SaveError,
  SCENE_STATUSES,
  Select,
  SuggestInput,
  toNumber,
  useSave,
  useSuggestions
} from './editing.jsx'

// One scene's fields, then its beats in order, editable in place. Planned beats are
// what the scene is still missing; "in draft" beats have landed; cut beats
// stay in their place in the order but drop out of the count.

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

function BeatSummary({ beats }) {
  if (beats.length === 0) return <p className="beat-summary muted">No beats yet.</p>

  const landed = beats.filter((b) => b.status === 'in draft').length
  const missing = beats.filter((b) => b.status === 'planned').length
  const cut = beats.length - landed - missing
  const active = landed + missing

  if (active === 0) return <p className="beat-summary muted">All {plural(cut, 'beat')} cut.</p>

  return (
    <div className="beat-summary">
      <p>
        <strong>
          {landed} of {plural(active, 'beat')} landed
        </strong>
        {' · '}
        {missing === 0 ? (
          <span className="nothing-missing">nothing missing</span>
        ) : (
          <span className="still-missing">{missing} still missing</span>
        )}
        {cut > 0 && <span className="muted"> · {cut} cut</span>}
      </p>
      <div className="beat-bar" aria-hidden="true">
        <span className="beat-bar-landed" style={{ flexGrow: landed }} />
        <span className="beat-bar-missing" style={{ flexGrow: missing }} />
      </div>
    </div>
  )
}

// The scene's own fields, with an Edit button that turns them into a
// form. The filename is shown but can't be changed: the app never renames
// files. Title and position may differ from the ##-title filename.
function SceneForm({ scene, povs, onDone, onCancel }) {
  const [title, setTitle] = useState(scene.title)
  const [pov, setPov] = useState(scene.pov)
  const [status, setStatus] = useState(scene.status)
  const [position, setPosition] = useState(String(scene.position))
  const { busy, error, save } = useSave()

  function submit(e) {
    e.preventDefault()
    save(() => window.ficBible.updateScene(scene.id, { title, pov, status, position: toNumber(position) }), onDone)
  }

  return (
    <form className="edit-form scene-form" onSubmit={submit}>
      <Field label="Title" wide>
        {(id) => <input id={id} type="text" value={title} required autoFocus onChange={(e) => setTitle(e.target.value)} />}
      </Field>
      <div className="edit-row">
        <Field label="POV">{(id) => <SuggestInput id={id} value={pov} onChange={setPov} options={povs} />}</Field>
        <Field label="Status">{(id) => <Select id={id} value={status} onChange={setStatus} options={SCENE_STATUSES} />}</Field>
        <Field label="Position">{(id) => <NumberInput id={id} value={position} onChange={setPosition} required />}</Field>
      </div>
      <p className="muted edit-note">File: {scene.filename} (the app doesn’t rename files)</p>
      <SaveError error={error} />
      <FormActions busy={busy} onCancel={onCancel} />
    </form>
  )
}

function SceneFields({ scene, povs, onChanged }) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <SceneForm
        scene={scene}
        povs={povs}
        onCancel={() => setEditing(false)}
        onDone={() => {
          setEditing(false)
          onChanged()
        }}
      />
    )
  }
  return (
    <>
      <div className="title-row">
        <h1>{scene.title}</h1>
        <button type="button" className="edit-button" onClick={() => setEditing(true)}>
          Edit scene
        </button>
      </div>
      <dl className="scene-fields">
        <div>
          <dt>POV</dt>
          <dd>{scene.pov}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <Status value={scene.status} />
          </dd>
        </div>
        <div>
          <dt>Position</dt>
          {/* Not "N of M": a position override can leave gaps. */}
          <dd>
            Scene {scene.position}{' '}
            <span className="muted">
              ({scene.chapterSceneCount} {scene.chapterSceneCount === 1 ? 'scene' : 'scenes'} in chapter)
            </span>
          </dd>
        </div>
        <div>
          <dt>Words</dt>
          <dd className="num">
            <Wordcount scene={scene} />
          </dd>
        </div>
      </dl>
    </>
  )
}

// refreshKey re-reads the scene without blanking it; onChanged() is called
// after any edit so App can bump it (and refresh the sidebar).
export default function SceneDetail({ sceneId, onOpenProse, refreshKey, onChanged }) {
  const result = useQuery(() => window.ficBible.sceneDetail(sceneId), sceneId, refreshKey)
  const { kinds, povs } = useSuggestions(refreshKey)

  if (result.loading) return <p className="muted">Loading…</p>
  if (result.ok === false) return <QueryError what="this scene" error={result.error} />
  if (result.data === null) return <p className="muted">Scene not found.</p>

  const scene = result.data
  return (
    <article className="scene-detail">
      <header>
        <p className="muted">
          {scene.work.title} · Chapter {scene.chapter.number}: {scene.chapter.title}
        </p>
        <SceneFields key={scene.id} scene={scene} povs={povs} onChanged={onChanged} />
        <button type="button" className="link-button view-prose" onClick={onOpenProse}>
          View prose →
        </button>
      </header>

      <section aria-label="Beats">
        <h2>Beats</h2>
        <BeatSummary beats={scene.beats} />
        <BeatList scene={scene} kinds={kinds} onChanged={onChanged} />
      </section>
    </article>
  )
}
