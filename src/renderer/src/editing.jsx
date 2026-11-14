import { useId, useState } from 'react'
import { useQuery } from './useQuery.js'

// Small pieces shared by the edit forms. The main process validates every
// write; these forms only make the common mistakes obvious early.

export const BEAT_STATUSES = ['planned', 'in draft', 'cut']
export const SCENE_STATUSES = ['outlined', 'drafting', 'drafted', 'revised']
export const CHAPTER_STATUSES = ['drafting', 'ready to post', 'posted']

// Previously used kinds and POVs, and every fandom and ship, re-read
// whenever refreshKey changes. A failed read just means no suggestions.
export function useSuggestions(refreshKey) {
  const result = useQuery(() => window.ficBible.suggestions(), 'suggestions', refreshKey)
  return result.ok ? result.data : { kinds: [], povs: [], fandoms: [], ships: [] }
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

// A text input offering previously used values (most used first). Each
// option is { value, count }; count is optional, and shown when given.
export function SuggestInput({ id, value, onChange, options, required }) {
  const listId = `${id}-options`
  return (
    <>
      <input id={id} type="text" list={listId} value={value} required={required} onChange={(e) => onChange(e.target.value)} />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.count === undefined ? '' : `used ${o.count}×`}
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

// A small pencil after a title that opens its edit form. Faint until the
// title row is hovered or the button has focus. label names what it edits
// ("Edit chapter"); it's the button's accessible name and its tooltip.
export function EditButton({ label, onClick }) {
  return (
    <button type="button" className="edit-button" aria-label={label} title={label} onClick={onClick}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
        <path
          d="M11.3 2.3a1.5 1.5 0 0 1 2.1 0l.3.3a1.5 1.5 0 0 1 0 2.1L5.5 12.9 2.5 13.5l.6-3 8.2-8.2Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path d="M10 3.6 12.4 6" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    </button>
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
