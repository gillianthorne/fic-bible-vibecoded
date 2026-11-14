import { useQuery } from './useQuery.js'
import { QueryError } from './QueryError.jsx'
import { Status, Wordcount } from './labels.jsx'

// Read-only. One scene's fields, then its beats in order. Planned beats are
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

function ParagraphRef({ value, paragraphs }) {
  if (value === null) return null
  const outside = paragraphs !== null && value > paragraphs
  return (
    <span className="beat-ref">
      ¶ {value}
      {outside && <span className="file-error"> (file has {plural(paragraphs, 'paragraph')})</span>}
    </span>
  )
}

function Beat({ beat, paragraphs }) {
  return (
    <li className={`beat beat-${beat.status.replace(/\s+/g, '-')}`}>
      <span className="beat-marker" aria-hidden="true" />
      <div>
        <div className="beat-meta">
          <span className="beat-kind">{beat.kind}</span>
          <span className="beat-status">{beat.status}</span>
          <ParagraphRef value={beat.paragraphRef} paragraphs={paragraphs} />
        </div>
        <p className="beat-content">{beat.content}</p>
      </div>
    </li>
  )
}

export default function SceneDetail({ sceneId, onOpenProse }) {
  const result = useQuery(() => window.ficBible.sceneDetail(sceneId), sceneId)

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
        <h1>{scene.title}</h1>
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
            <dd>
              Scene {scene.position} of {scene.chapterSceneCount}
            </dd>
          </div>
          <div>
            <dt>Words</dt>
            <dd className="num">
              <Wordcount scene={scene} />
            </dd>
          </div>
        </dl>
        <button type="button" className="link-button view-prose" onClick={onOpenProse}>
          View prose →
        </button>
      </header>

      <section aria-label="Beats">
        <h2>Beats</h2>
        <BeatSummary beats={scene.beats} />
        {scene.beats.length > 0 && (
          <ol className="beats">
            {scene.beats.map((beat) => (
              <Beat key={beat.id} beat={beat} paragraphs={scene.paragraphs} />
            ))}
          </ol>
        )}
      </section>
    </article>
  )
}
