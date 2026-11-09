/** Small pure helpers shared by the wall page, hooks and components. */

import { TAB_STORAGE_KEY } from '../../constants.js'
import type { Tab } from './types.js'
import { DESK_TABS } from './tabs.js'

/** 12.3K / 52.8M style shorthand used by the session meta (trim trailing .0). */
export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value < 1000) return String(Math.round(value))
  const units = ['K', 'M', 'B'] as const
  let scaled = value
  let unit = -1
  while (scaled >= 1000 && unit < units.length - 1) {
    scaled /= 1000
    unit += 1
  }
  const rounded = scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1)
  return `${rounded.replace(/\.0$/u, '')}${units[unit]}`
}

export function formatTokens(value: number): string {
  return `${formatCompactNumber(value)} tok`
}

export const messageOf = (reason: unknown): string => reason instanceof Error ? reason.message : String(reason)

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max))

/**
 * Restore the tab the user left on. Derived from DESK_TABS so a new tab is remembered without
 * touching this function (a hard-coded list previously forgot `schedule` / `sessions`).
 */
export function readInitialTab(): Tab {
  try {
    const value = window.localStorage.getItem(TAB_STORAGE_KEY)
    const known = DESK_TABS.find(entry => entry.tab === value)
    if (known !== undefined) return known.tab
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
