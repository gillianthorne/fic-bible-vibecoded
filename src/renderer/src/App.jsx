import { useEffect, useState } from 'react'

export default function App() {
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    window.ficBible.getStatus().then(setStatus, (e) => setError(String(e)))
  }, [])

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 16 }}>
      <h1>Fic Bible: spike</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <pre>{status ? JSON.stringify(status, null, 2) : 'Loading…'}</pre>
    </main>
  )
}
