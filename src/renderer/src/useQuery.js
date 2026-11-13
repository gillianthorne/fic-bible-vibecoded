import { useEffect, useState } from 'react'

// Runs one main-process query and tracks its result. `run` returns a
// promise of { ok, data } or { ok, error }; `key` re-runs it when changed.
// A response that arrives after the key has moved on is dropped, so a slow
// read can't overwrite a newer one.
//
// Returns { loading: true } | { ok: true, data } | { ok: false, error }.
export function useQuery(run, key) {
  const [state, setState] = useState({ loading: true })

  useEffect(() => {
    let current = true
    setState({ loading: true })
    run().then(
      (result) => current && setState(result),
      (e) => current && setState({ ok: false, error: String(e?.message ?? e) })
    )
    return () => {
      current = false
    }
    // `run` is rebuilt each render; `key` is what identifies the query.
  }, [key])

  return state
}
