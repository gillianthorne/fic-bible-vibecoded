// What the last import did: rows added, works cleared, and everything that
// was skipped with its reason. Shown in the main pane after an import.

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

export default function ImportReport({ report }) {
  const { libraryRoot, added, cleared, skipped } = report
  const addedAny = added.works + added.chapters + added.scenes > 0

  return (
    <article className="import-report">
      <header>
        <h1>Import</h1>
        <p className="muted import-root">{libraryRoot}</p>
      </header>

      <p role="status">
        {addedAny
          ? `Added ${plural(added.works, 'work', 'works')}, ${plural(added.chapters, 'chapter', 'chapters')} and ${plural(
              added.scenes,
              'scene',
              'scenes'
            )}.`
          : 'Nothing new to add. Everything in this folder was already imported.'}
        {cleared > 0 && ` Cleared ${plural(cleared, 'work', 'works')} that had no folder here.`}
      </p>

      {skipped.length === 0 ? (
        <p className="muted">Nothing was skipped.</p>
      ) : (
        <>
          <h2>Skipped ({skipped.length})</h2>
          <p className="muted">These weren’t imported. Nothing on disk was changed.</p>
          <table>
            <thead>
              <tr>
                <th scope="col">Path</th>
                <th scope="col">Reason</th>
              </tr>
            </thead>
            <tbody>
              {skipped.map((s) => (
                <tr key={s.path}>
                  <td className="import-path">{s.path}</td>
                  <td>{s.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </article>
  )
}
