import { useEffect, useState } from 'react'

function Check({ title, result, children }) {
  return (
    <section>
      <h2>
        {title}: {result.ok ? 'OK' : 'FAILED'}
      </h2>
      {result.ok ? children : <pre style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>{result.error}</pre>}
    </section>
  )
}

export default function App() {
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    window.ficBible.getStatus().then(setStatus, (e) => setError(String(e)))
  }, [])

  if (error) return <pre style={{ color: 'crimson' }}>{error}</pre>
  if (!status) return <p>Loading…</p>

  const { database, library, scene } = status
  return (
    <main style={{ fontFamily: 'sans-serif', padding: 16 }}>
      <h1>Fic Bible: spike</h1>

      <Check title="Scene" result={scene}>
        <p>
          Words: {scene.words}
          <br />
          Paragraphs: {scene.paragraphs}
          <br />
          File: {scene.path}
        </p>
      </Check>

      <Check title="Library root" result={library}>
        <p>
          {library.libraryRoot}
          <br />
          Source: {library.source}
          <br />
          Config file: {library.configPath}
        </p>
      </Check>

      <Check title="SQLite" result={database}>
        <p>
          Version: {database.sqliteVersion}
          <br />
          File: {database.path}
        </p>
      </Check>
    </main>
  )
}
