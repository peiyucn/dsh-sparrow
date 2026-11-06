/** Small pure helpers shared by the wall page, hooks and components. */

import { TAB_STORAGE_KEY } from '../../constants.js'
import type { Tab } from './types.js'

export const messageOf = (reason: unknown): string => reason instanceof Error ? reason.message : String(reason)

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max))

/**
 * Restore the tab the user left on. `localStorage` can be unavailable (private mode), in which
 * case we silently fall back to the notes wall — the UI stays usable, only the memory is lost.
 */
export function readInitialTab(): Tab {
  try {
    const value = window.localStorage.getItem(TAB_STORAGE_KEY)
    if (value === 'overview' || value === 'notes' || value === 'tasks') return value
  } catch {
    // Private mode / storage disabled: use the default tab.
  }
  return 'notes'
}

/**
 * Fallback position for notes without stored coordinates (e.g. created by an agent):
 * a five-column grid with a slight stagger so they do not overlap perfectly.
 */
export function fallbackPosition(index: number): { x: number; y: number } {
  return {
    x: 24 + (index % 5) * 208 + (index % 2) * 18,
    y: 24 + Math.floor(index / 5) * 190 + (index % 2) * 18,
  }
}

/** Date shown in the trash list (day granularity is enough there). */
export function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10)
  return date.toLocaleDateString()
}
