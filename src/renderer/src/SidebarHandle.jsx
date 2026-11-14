import { useState } from 'react'

// The sidebar's width, set by dragging the handle on its right edge (or
// with the arrow keys when the handle has focus; double-click resets it).
// It's kept in localStorage so it survives a restart. That storage can be
// missing or throw, so every read and write is guarded and the default
// is used instead.

const KEY = 'ficBible.sidebarWidth'
export const DEFAULT_WIDTH = 240
const MIN_WIDTH = 160
const MAX_WIDTH = 520
const STEP = 16

const clamp = (w) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(w)))

function load() {
  try {
    const w = Number(localStorage.getItem(KEY))
    return Number.isFinite(w) && w > 0 ? clamp(w) : DEFAULT_WIDTH
  } catch {
    return DEFAULT_WIDTH
  }
}

function save(w) {
  try {
    localStorage.setItem(KEY, String(w))
  } catch {
    // Not saved: the width lasts until the app closes.
  }
}

export function useSidebarWidth() {
  const [width, setWidth] = useState(load)
  const set = (w, persist = true) => {
    const next = clamp(w)
    setWidth(next)
    if (persist) save(next)
  }
  return [width, set]
}

export default function SidebarHandle({ width, onResize }) {
  const startDrag = (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const startWidth = width
    let latest = startWidth
    document.body.classList.add('resizing')

    const move = (ev) => {
      latest = startWidth + ev.clientX - startX
      onResize(latest, false)
    }
    const end = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', end)
      handle.removeEventListener('pointercancel', end)
      document.body.classList.remove('resizing')
      onResize(latest)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', end)
    handle.addEventListener('pointercancel', end)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowLeft') onResize(width - STEP)
    else if (e.key === 'ArrowRight') onResize(width + STEP)
    else if (e.key === 'Home') onResize(MIN_WIDTH)
    else if (e.key === 'End') onResize(MAX_WIDTH)
    else return
    e.preventDefault()
  }

  return (
    <div
      className="sidebar-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={width}
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={MAX_WIDTH}
      tabIndex={0}
      title="Drag to resize; double-click to reset"
      onPointerDown={startDrag}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onResize(DEFAULT_WIDTH)}
    />
  )
}
