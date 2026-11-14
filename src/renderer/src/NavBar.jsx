import { useQuery } from './useQuery.js'

// The bar above the sheet: a back button, then where the open screen sits,
// as Home / work / chapter / scene. Every part but the last opens its
// screen; the last is the open screen itself.
//
// Titles come from the navigation tree, the same read the sidebar does, so
// this reads no files. refreshKey re-reads it after an import or edit, so
// a renamed title shows here too.

// The work, chapter and scene the selection is in, as far down as it goes.
// Any of them is null if the selection isn't that deep, or isn't found.
function locate(tree, selection) {
  for (const work of tree) {
    if (selection.kind === 'work' && work.id === selection.id) return { work }
    for (const chapter of work.chapters) {
      if (selection.kind === 'chapter' && chapter.id === selection.id) return { work, chapter }
      for (const scene of chapter.scenes) {
        if (selection.kind === 'scene' && scene.id === selection.id) return { work, chapter, scene }
      }
    }
  }
  return {}
}

function Crumb({ current, onClick, title, children }) {
  return (
    <li title={title}>
      {current ? (
        <span className="crumb crumb-current" aria-current="page">
          {children}
        </span>
      ) : (
        <button type="button" className="crumb" onClick={onClick}>
          {children}
        </button>
      )}
    </li>
  )
}

export default function NavBar({
  selection,
  canGoBack,
  onBack,
  refreshKey,
  onOpenHome,
  onOpenWork,
  onOpenChapter,
  onOpenScene
}) {
  const tree = useQuery(() => window.ficBible.navigationTree(), 'navbar', refreshKey)
  const { work, chapter, scene } = tree.ok ? locate(tree.data, selection) : {}
  const prose = selection.kind === 'scene' && selection.view === 'prose'

  return (
    <div className="nav-bar">
      <button type="button" className="nav-back" onClick={onBack} disabled={!canGoBack}>
        <span aria-hidden="true">←</span> Back
      </button>
      <nav aria-label="Breadcrumb">
        <ol className="breadcrumb">
          <Crumb current={selection.kind === 'home'} onClick={onOpenHome}>
            Home
          </Crumb>
          {work && (
            <Crumb current={selection.kind === 'work'} onClick={() => onOpenWork(work.id)} title={work.title}>
              {work.title}
            </Crumb>
          )}
          {chapter && (
            <Crumb
              current={selection.kind === 'chapter'}
              onClick={() => onOpenChapter(chapter.id, work.id)}
              title={chapter.title}
            >
              {chapter.number}. {chapter.title}
            </Crumb>
          )}
          {scene && (
            <Crumb
              current={selection.kind === 'scene' && !prose}
              onClick={() => onOpenScene(scene.id, chapter.id, work.id)}
              title={scene.title}
            >
              {scene.position}. {scene.title}
            </Crumb>
          )}
          {prose && scene && <Crumb current>Prose</Crumb>}
          {selection.kind === 'import' && <Crumb current>Import report</Crumb>}
        </ol>
      </nav>
    </div>
  )
}
