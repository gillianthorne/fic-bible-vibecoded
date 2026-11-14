import { useQuery } from './useQuery.js'
import { QueryError } from './QueryError.jsx'
import Markdown from './Markdown.jsx'

// Read-only view of a scene's file, numbered by paragraph so a beat's
// paragraph_ref can be found. The paragraphs come from the main process
// already split by splitParagraphs, the same split the paragraph count
// uses; the number shown is the paragraph's place in that list, 1-based.

function Body({ scene }) {
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

export default function ProseViewer({ sceneId, onBack }) {
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
            {scene.paragraphs.length} paragraph{scene.paragraphs.length === 1 ? '' : 's'}
          </p>
        )}
      </header>
      <Body scene={scene} />
    </article>
  )
}
