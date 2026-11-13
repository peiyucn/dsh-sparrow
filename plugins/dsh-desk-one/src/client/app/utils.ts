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
    const stored = window.localStorage.getItem(TAB_STORAGE_KEY)
    // The old Overview tab became Notebook; keep returning users on it instead of resetting.
    const value = stored === 'overview' ? 'notebook' : stored
    const known = DESK_TABS.find(entry => entry.tab === value)
    if (known !== undefined) return known.tab
  } catch {
    // Private mode / storage disabled: use the default tab.
  }
  return 'schedule'
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

/**
 * Locale used for date output. The official locale runtime keeps `<html lang>` in sync with the
 * active UI language (zh → `zh-CN`, otherwise the active locale id), so dates follow the interface
 * language instead of the browser's own locale (a Chinese UI on an English browser used to render
 * English month names).
 */
function activeDateLocale(): string {
  const lang = typeof document === 'undefined' ? '' : document.documentElement.lang
  return lang === '' ? 'en' : lang
}

/**
 * Format one date in an explicit locale (the UI-locale wrappers below call it with the active one).
 * @param locale - BCP 47 locale id, e.g. `zh-CN` / `en`.
 * @param value - timestamp, ISO string or Date.
 * @param style - `date`: y/m/d; `short`: month + day; `datetime`: y/m/d + h:m; `time`: h:m.
 * @returns the localized text, or a stable fallback for invalid input.
 */
export function formatDateIn(
  locale: string,
  value: number | string | Date,
  style: 'date' | 'short' | 'datetime' | 'time' = 'date',
): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value.slice(0, 10) : ''
  const options: Intl.DateTimeFormatOptions = style === 'short'
    ? { month: 'short', day: 'numeric' }
    : style === 'time'
      ? { hour: '2-digit', minute: '2-digit' }
      : style === 'datetime'
        ? { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
        : { year: 'numeric', month: '2-digit', day: '2-digit' }
  return new Intl.DateTimeFormat(locale, options).format(date)
}

/** Date shown in session rows and the trash list (day granularity, UI locale). */
export function formatDate(value: number | string | Date): string {
  return formatDateIn(activeDateLocale(), value)
}

/** Month + day only (session archive / stray / trash rows, UI locale). */
export function formatShortDate(value: number | string | Date): string {
  return formatDateIn(activeDateLocale(), value, 'short')
}

/** Date + time (annotation records, review baselines, UI locale). */
export function formatDateTime(value: number | string | Date): string {
  return formatDateIn(activeDateLocale(), value, 'datetime')
}

/** Clock time only (review baseline hint, UI locale). */
export function formatTime(value: number | string | Date): string {
  return formatDateIn(activeDateLocale(), value, 'time')
}
