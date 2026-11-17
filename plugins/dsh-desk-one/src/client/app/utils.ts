

import { TAB_STORAGE_KEY } from '../../constants.js'
import type { Tab } from './types.js'
import { DESK_TABS } from './tabs.js'


interface CompactNumberStyle {

  readonly units: readonly string[]

  readonly decimals: 'trim' | 'fixed'
}


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


export function formatCompactNumber(value: number): string {
  return scaleCompact(value, { units: ['K', 'M', 'B'], decimals: 'trim' })
}

export function formatTokens(value: number): string {
  return `${formatCompactNumber(value)} tok`
}


export function formatTokenCount(value: number): string {
  return scaleCompact(value, { units: ['k', 'M'], decimals: 'fixed' })
}


export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}


export type RelativeTimeUnit = 'never' | 'now' | 'minutes' | 'hours' | 'days'


export interface RelativeTime {
  readonly unit: RelativeTimeUnit

  readonly count: number
}


export function relativeTimeOf(at: number, now: number = Date.now()): RelativeTime {
  if (at <= 0) return { unit: 'never', count: 0 }
  const minutes = Math.max(0, Math.floor((now - at) / 60_000))
  if (minutes < 1) return { unit: 'now', count: 0 }
  if (minutes < 60) return { unit: 'minutes', count: minutes }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return { unit: 'hours', count: hours }
  return { unit: 'days', count: Math.floor(hours / 24) }
}


export function formatKilobytes(bytes: number): string {
  return (bytes / 1024).toFixed(1)
}


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


export interface LoadTickets {

  take(): number

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

      return ticket > 0 && ticket === current
    },
  }
}


export interface KeyGuard {

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


export function readInitialTab(): Tab {
  try {
    const stored = window.localStorage.getItem(TAB_STORAGE_KEY)

    const value = stored === 'overview' ? 'notebook' : stored
    const known = DESK_TABS.find(entry => entry.tab === value)
    if (known !== undefined) return known.tab
  } catch {

  }


  return DESK_TABS[0]?.tab ?? 'notes'
}


export function fallbackPosition(index: number): { x: number; y: number } {
  return {
    x: 24 + (index % 5) * 208 + (index % 2) * 18,
    y: 24 + Math.floor(index / 5) * 190 + (index % 2) * 18,
  }
}


function activeDateLocale(): string {
  const lang = typeof document === 'undefined' ? '' : document.documentElement.lang
  return lang === '' ? 'en' : lang
}


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


export function formatDate(value: number | string | Date): string {
  return formatDateIn(activeDateLocale(), value)
}


export function formatShortDate(value: number | string | Date): string {
  return formatDateIn(activeDateLocale(), value, 'short')
}


export function formatShortDateTime(value: number | string | Date): string {
  return formatDateIn(activeDateLocale(), value, 'short-datetime')
}


export function formatDateTime(value: number | string | Date): string {
  return formatDateIn(activeDateLocale(), value, 'datetime')
}


export function formatTime(value: number | string | Date): string {
  return formatDateIn(activeDateLocale(), value, 'time')
}
