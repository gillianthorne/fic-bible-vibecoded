import { useQuery } from './useQuery.js'
import { QueryError } from './QueryError.jsx'
import Markdown from './Markdown.jsx'
import { number } from './labels.jsx'

const count = (n, noun) => `${number(n)} ${noun}${n === 1 ? '' : 's'}`

// Read-only view of a scene's file, numbered by paragraph so a beat's
// paragraph_ref can be found. The paragraphs come from the main process
// already split by splitParagraphs, the same split the paragraph count
// uses; the number shown is the paragraph's place in that list, 1-based.

export function Body({ scene }) {
  if (scene.fileError !== null) {
    const what = scene.fileError === 'ENOENT' ? 'The scene file is missing' : "The scene file couldn't be read"
    return (
      <p className="file-error" title={scene.path}>
        {what} ({scene.fileError}).
      </p>
    )
  }
  if (scene.paragraphs.length === 0) return <p className="muted">No paragraphs yet: the file is empty.</p>

  return (
    <ol className="prose">
      {scene.paragraphs.map((paragraph, i) => (
        <li key={i} className="prose-paragraph">
          <span className="prose-number">{i + 1}</span>
          <div className="prose-text">
            <Markdown paragraph={paragraph} />
          </div>
        </li>
      ))}
    </ol>
  )
}

// Previous / next links, above and below the prose. Either side is null
// at the start or end; that side is left empty so the other stays put.
// label(item) is the link's text.
export function Flip({ previous, next, label, onOpen, what }) {
  return (
    <nav className="prose-flip" aria-label={`Previous and next ${what}`}>
      {previous ? (
        <button type="button" className="link-button prose-flip-previous" onClick={() => onOpen(previous)}>
          ← {label(previous)}
        </button>
      ) : (
        <span />
      )}
      {next && (
        <button type="button" className="link-button prose-flip-next" onClick={() => onOpen(next)}>
          {label(next)} →
        </button>
      )}
    </nav>
  )
}

const sceneLabel = (s) => `Ch ${s.chapterNumber}, scene ${s.position}: ${s.title}`

// onOpenScene(scene) opens another scene's prose: scene is
// { id, chapterId, ... } from previous or next.
export default function ProseViewer({ sceneId, onBack, onOpenScene }) {
  const result = useQuery(() => window.ficBible.sceneProse(sceneId), sceneId)

  const back = (
    <button type="button" className="link-button" onClick={onBack}>
      ← Back to scene
    </button>
  )

  if (result.loading) return <p className="muted">Loading…</p>
  if (result.ok === false)
    return (
      <>
        {back}
        <QueryError what="this scene's prose" error={result.error} />
      </>
    )
  if (result.data === null) return <p className="muted">Scene not found.</p>

  const scene = result.data
  return (
    <article className="prose-viewer">
      <header>
        {back}
        <p className="muted">
          {scene.work.title} · Chapter {scene.chapter.number}: {scene.chapter.title}
        </p>
        <h1>{scene.title}</h1>
        {scene.paragraphs?.length > 0 && (
          <p className="muted">
            {count(scene.paragraphs.length, 'paragraph')} · {count(scene.wordcount, 'word')}
          </p>
        )}
        <Flip previous={scene.previous} next={scene.next} label={sceneLabel} onOpen={onOpenScene} what="scene" />
      </header>
      <Body scene={scene} />
      <footer className="prose-footer">
        <Flip previous={scene.previous} next={scene.next} label={sceneLabel} onOpen={onOpenScene} what="scene" />
      </footer>
    </article>
  )
}
