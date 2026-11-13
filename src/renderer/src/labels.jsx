// Small display pieces shared by the main-pane screens.

export const number = (n) => n.toLocaleString()

// A wordcount read from a scene file, or why it couldn't be read.
export function Wordcount({ scene }) {
  if (scene.wordcount !== null) return number(scene.wordcount)
  const label = scene.fileError === 'ENOENT' ? 'file missing' : 'unreadable'
  return (
    <span className="file-error" title={scene.fileError}>
      {label}
    </span>
  )
}

export function Status({ value }) {
  return <span className={`status status-${value.replace(/\s+/g, '-')}`}>{value}</span>
}
