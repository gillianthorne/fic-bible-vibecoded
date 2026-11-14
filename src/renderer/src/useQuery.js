import { useEffect, useRef, useState } from 'react'

// Runs one main-process query and tracks its result. `run` returns a
// promise of { ok, data } or { ok, error }; `key` re-runs it when changed.
// A response that arrives after the key has moved on is dropped, so a slow
// read can't overwrite a newer one.
//
// `refresh` also re-runs it, but keeps showing the current result until
// the new one arrives: used after an edit, so the screen doesn't blank to
// "Loading…" and back.
//
// Returns { loading: true } | { ok: true, data } | { ok: false, error }.
export function useQuery(run, key, refresh = 0) {
  const [state, setState] = useState({ loading: true })
  const lastKey = useRef(key)

  useEffect(() => {
    let current = true
    if (lastKey.current !== key) {
      lastKey.current = key
      setState({ loading: true })
    }
    run().then(
      (result) => current && setState(result),
      (e) => current && setState({ ok: false, error: String(e?.message ?? e) })
    )
    return () => {
      current = false
    }
    // `run` is rebuilt each render; `key` and `refresh` identify the query.
  }, [key, refresh])

  return state
}
