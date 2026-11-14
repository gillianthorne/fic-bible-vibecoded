import { useQuery } from './useQuery.js'
import { QueryError } from './QueryError.jsx'
import { number } from './labels.jsx'
import { Body, Flip } from './ProseViewer.jsx'

// Read-only view of a whole chapter: every scene's prose in order, on one
// page, to read straight through. Each scene is numbered by paragraph from
// 1, as in the single-scene viewer, since a beat's paragraph_ref is within
// its scene. A jump list at the top scrolls to each scene; a scene's
// heading opens that scene's detail.

const count = (n, noun) => `${number(n)} ${noun}${n === 1 ? '' : 's'}`

const anchor = (sceneId) => `chapter-prose-scene-${sceneId}`

const chapterLabel = (c) => `Chapter ${c.number}: ${c.title}`

function jumpTo(sceneId) {
  document.getElementById(anchor(sceneId))?.scrollIntoView({ block: 'start' })
}

// onBack() returns to the chapter overview; onOpenScene(sceneId,
// chapterId, workId) opens a scene's detail; onOpenChapter(chapter) opens
// another chapter's prose.
export default function ChapterProse({ chapterId, onBack, onOpenScene, onOpenChapter }) {
  const result = useQuery(() => window.ficBible.chapterProse(chapterId), chapterId)

  const back = (
    <button type="button" className="link-button" onClick={onBack}>
      ← Back to chapter
    </button>
  )

  if (result.loading) return <p className="muted">Loading…</p>
  if (result.ok === false)
    return (
      <>
        {back}
        <QueryError what="this chapter's prose" error={result.error} />
      </>
    )
  if (result.data === null) return <p className="muted">Chapter not found.</p>

  const chapter = result.data
  const flip = (
    <Flip previous={chapter.previous} next={chapter.next} label={chapterLabel} onOpen={onOpenChapter} what="chapter" />
  )
  return (
    <article className="prose-viewer chapter-prose">
      <header>
        {back}
        <p className="muted">{chapter.work.title}</p>
        <h1>{chapterLabel(chapter)}</h1>
        <p className="muted">
          {count(chapter.scenes.length, 'scene')} · {count(chapter.wordcount, 'word')}
          {chapter.uncounted > 0 && <span className="file-error"> ({chapter.uncounted} not counted)</span>}
        </p>
        {chapter.scenes.length > 1 && (
          <nav className="prose-jump" aria-label="Scenes in this chapter">
            <span className="muted">Jump to:</span>
            <ol>
              {chapter.scenes.map((scene) => (
                <li key={scene.id}>
                  <button type="button" className="link-button" onClick={() => jumpTo(scene.id)}>
                    {scene.position}. {scene.title}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        )}
        {flip}
      </header>

      {chapter.scenes.length === 0 && <p className="muted">No scenes in this chapter.</p>}
      {chapter.scenes.map((scene) => (
        <section key={scene.id} id={anchor(scene.id)} className="chapter-prose-scene" aria-label={scene.title}>
          <h2>
            <button
              type="button"
              className="link-button"
              title="Open this scene"
              onClick={() => onOpenScene(scene.id, chapter.id, chapter.work.id)}
            >
              {scene.position}. {scene.title}
            </button>
          </h2>
          <Body scene={scene} />
        </section>
      ))}

      <footer className="prose-footer">{flip}</footer>
    </article>
  )
}
