/** Small pure helpers shared by the wall page, hooks and components. */

import { TAB_STORAGE_KEY } from '../../constants.js'
import type { Tab } from './types.js'
import { DESK_TABS } from './tabs.js'

/** Unit suffixes plus decimal policy of one compact-number style. */
interface CompactNumberStyle {
  /** Suffixes from the smallest to the largest supported unit. */
  readonly units: readonly string[]
  /** `trim`: whole numbers from 100 up, one trimmed decimal below; `fixed`: always one decimal. */
  readonly decimals: 'trim' | 'fixed'
}

/** Shared scaling core; the two public styles differ only in units and decimals. */
function scaleCompact(value: number, style: CompactNumberStyle): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value < 1000) return String(Math.round(value))
  let scaled = value
  let unit = -1
  while (scaled >= 1000 && unit < style.units.length - 1) {
    scaled /= 1000
    unit += 1
  }
  const rounded = style.decimals === 'fixed'
    ? scaled.toFixed(1)
    : scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1).replace(/\.0$/u, '')
  return `${rounded}${style.units[unit]}`
}

/** 12.3K / 52.8M style shorthand used by the session meta (trim trailing .0). */
export function formatCompactNumber(value: number): string {
  return scaleCompact(value, { units: ['K', 'M', 'B'], decimals: 'trim' })
}

export function formatTokens(value: number): string {
  return `${formatCompactNumber(value)} tok`
}

/**
 * Token count as shown by the task card's session chip: `950`, `12.3k`, `1.0M`.
 *
 * Kept separate from {@link formatTokens}: that one appends the `tok` suffix and upper-cases the
 * unit (session archive meta), while the chip relies on its own label and the historical lower-case
 * spelling, so folding them together would change the rendered text.
 */
export function formatTokenCount(value: number): string {
  return scaleCompact(value, { units: ['k', 'M'], decimals: 'fixed' })
}

/** Compact wall time: 42s, 3m 12s, 1h 04m (task card's model-time stat). */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

/** Coarse age bucket of one timestamp; labels stay in the locale dictionary. */
export type RelativeTimeUnit = 'never' | 'now' | 'minutes' | 'hours' | 'days'

/** Age of a timestamp, bucketed for the task card's "last run" line. */
export interface RelativeTime {
  readonly unit: RelativeTimeUnit
  /** Magnitude of the bucket (0 for `never` / `now`). */
  readonly count: number
}

/**
 * Bucket a timestamp into the coarse age the task card shows (`never` for a zero timestamp).
 * @param at - epoch ms of the dated moment; `<= 0` means "not run yet".
 * @param now - current epoch ms (injected for pure rendering / tests).
 * @returns the bucket plus its magnitude.
 */
export function relativeTimeOf(at: number, now: number = Date.now()): RelativeTime {
  if (at <= 0) return { unit: 'never', count: 0 }
  const minutes = Math.max(0, Math.floor((now - at) / 60_000))
  if (minutes < 1) return { unit: 'now', count: 0 }
  if (minutes < 60) return { unit: 'minutes', count: minutes }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return { unit: 'hours', count: hours }
  return { unit: 'days', count: Math.floor(hours / 24) }
}

/**
 * Byte count in whole kilobytes with one decimal (`1.5`), for dictionaries whose string already
 * carries the `KB` unit (e.g. `notebook.historyUsage`). Use the official `fileSizeText` when the
 * unit is ours to choose.
 */
export function formatKilobytes(bytes: number): string {
  return (bytes / 1024).toFixed(1)
}

/**
 * Local date label of a wall note: `YYYY-MM-DD` on the paper edge, `YYYY-MM-DD HH:mm` in the hover
 * title. Locale-independent on purpose (the note edge is a fixed stamp, not a localised sentence).
 * @returns both labels, or null for an invalid timestamp.
 */
export function formatLocalDateTime(
  value: number | string | Date,
): { readonly short: string; readonly full: string } | null {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const pad = (part: number): string => String(part).padStart(2, '0')
  const short = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return { short, full: `${short} ${pad(date.getHours())}:${pad(date.getMinutes())}` }
}

export const messageOf = (reason: unknown): string => reason instanceof Error ? reason.message : String(reason)

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max))

/**
 * Latest-request-wins tickets for overlapping loads (notes reload, schedule range switch).
 *
 * Every load takes a ticket and only the newest ticket may write state. Without this, a slow
 * earlier response lands after a newer one and renders the previous view's data.
 */
export interface LoadTickets {
  /** Take the newest ticket; invalidates every ticket handed out before it. */
  take(): number
  /** Whether the ticket is still the newest one. */
  isLatest(ticket: number): boolean
}

export function createLoadTickets(): LoadTickets {
  let current = 0
  return {
    take(): number {
      current += 1
      return current
    },
    isLatest(ticket: number): boolean {
      // `0` is never a ticket, so a caller that forgot `take()` cannot claim to be current.
      return ticket > 0 && ticket === current
    },
  }
}

/**
 * Per-key in-flight guard for UI entries that write the same record.
 *
 * Controls like the calendar colour / sync switches stay clickable while their write is in
 * flight; a second click would send a stale `expectedRevision` and surface a spurious 409. One
 * write per key at a time keeps the store contract (compare-and-set) intact without disabling the
 * whole card, and different records still write in parallel.
 */
export interface KeyGuard {
  /** Run `task` unless another task with the same key is still running. */
  run(key: string, task: () => Promise<void>): Promise<void>
}

export function createKeyGuard(): KeyGuard {
  const running = new Set<string>()
  return {
    async run(key, task): Promise<void> {
      if (running.has(key)) return
      running.add(key)
      try {
        await task()
      } finally {
        running.delete(key)
      }
    },
  }
}

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
  // First visit lands on the first tab (quick capture), so reordering DESK_TABS also moves the
  // default landing page instead of leaving it stale.
  return DESK_TABS[0]?.tab ?? 'notes'
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
 * @param style - `date`: y/m/d; `short`: month + day; `datetime`: y/m/d + h:m; `short-datetime`: month + day + h:m; `time`: h:m.
 * @returns the localized text, or a stable fallback for invalid input.
 */
export function formatDateIn(
  locale: string,
  value: number | string | Date,
  style: 'date' | 'short' | 'datetime' | 'short-datetime' | 'time' = 'date',
): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value.slice(0, 10) : ''
  const options: Intl.DateTimeFormatOptions = style === 'short'
    ? { month: 'short', day: 'numeric' }
    : style === 'time'
      ? { hour: '2-digit', minute: '2-digit' }
      : style === 'datetime'
        ? { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
        : style === 'short-datetime'
          ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
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

/** Month + day + clock minute (compact session rows, UI locale). */
export function formatShortDateTime(value: number | string | Date): string {
  return formatDateIn(activeDateLocale(), value, 'short-datetime')
}

/** Date + time (annotation records, review baselines, UI locale). */
export function formatDateTime(value: number | string | Date): string {
  return formatDateIn(activeDateLocale(), value, 'datetime')
}

/** Clock time only (review baseline hint, UI locale). */
export function formatTime(value: number | string | Date): string {
  return formatDateIn(activeDateLocale(), value, 'time')
}
