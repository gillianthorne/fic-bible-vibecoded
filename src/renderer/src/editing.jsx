import { useId, useState } from 'react'
import { useQuery } from './useQuery.js'

// Small pieces shared by the edit forms. The main process validates every
// write; these forms only make the common mistakes obvious early.

export const BEAT_STATUSES = ['planned', 'in draft', 'cut']
export const SCENE_STATUSES = ['outlined', 'drafting', 'drafted', 'revised']
export const CHAPTER_STATUSES = ['drafting', 'ready to post', 'posted']

// Previously used kinds and POVs, re-read whenever refreshKey changes.
// A failed read just means no suggestions.
export function useSuggestions(refreshKey) {
  const result = useQuery(() => window.ficBible.suggestions(), 'suggestions', refreshKey)
  return result.ok ? result.data : { kinds: [], povs: [] }
}

// Runs a save call ({ ok, data } | { ok, error }) and tracks busy/error.
// onDone runs only after a successful save.
export function useSave() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  async function save(call, onDone) {
    setBusy(true)
    setError(null)
    try {
      const result = await call()
      if (result.ok) onDone?.(result.data)
      else setError(result.error)
    } catch (e) {
      setError(String(e?.message ?? e))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, save, clearError: () => setError(null) }
}

export function Field({ label, children, wide }) {
  const id = useId()
  return (
    <div className={['edit-field', wide && 'edit-field-wide'].filter(Boolean).join(' ')}>
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  )
}

// A text input offering previously used values (most used first).
export function SuggestInput({ id, value, onChange, options, required }) {
  const listId = `${id}-options`
  return (
    <>
      <input id={id} type="text" list={listId} value={value} required={required} onChange={(e) => onChange(e.target.value)} />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {`used ${o.count}×`}
          </option>
        ))}
      </datalist>
    </>
  )
}

export function Select({ id, value, onChange, options }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}

// Whole number input. Holds the text as typed; toNumber() reads it.
export function NumberInput({ id, value, onChange, required }) {
  return (
    <input
      id={id}
      type="number"
      min="1"
      step="1"
      inputMode="numeric"
      className="edit-number"
      value={value}
      required={required}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

// '' -> null, '3' -> 3, anything else -> NaN (refused by the main process
// with a clear message).
export const toNumber = (text) => (String(text).trim() === '' ? null : Number(text))

export function FormActions({ busy, onCancel, saveLabel = 'Save' }) {
  return (
    <div className="edit-actions">
      <button type="submit" className="button-primary" disabled={busy}>
        {busy ? 'Saving…' : saveLabel}
      </button>
      <button type="button" disabled={busy} onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}

export function SaveError({ error }) {
  if (!error) return null
  return (
    <p className="save-error" role="alert">
      {error}
    </p>
  )
}
