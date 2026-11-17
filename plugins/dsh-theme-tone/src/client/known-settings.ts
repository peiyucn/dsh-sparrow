

import { availableToneIds, type ThemeToneSettings, type ToneId } from '../tones.js'


export const KNOWN_SETTINGS_STORAGE_KEY = 'dsh-theme-tone:last-known-settings'


export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}


export function parseKnownSettings(raw: string | null): ThemeToneSettings | null {
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    const record = parsed as Record<string, unknown>
    const lightTone = record.lightTone
    const darkTone = record.darkTone
    if (typeof lightTone !== 'string' || typeof darkTone !== 'string') return null
    if (!availableToneIds('light').includes(lightTone as ToneId)) return null
    if (!availableToneIds('dark').includes(darkTone as ToneId)) return null
    return { lightTone: lightTone as ThemeToneSettings['lightTone'], darkTone: darkTone as ThemeToneSettings['darkTone'] }
  } catch {
    return null
  }
}


export function readKnownSettings(storage: KeyValueStorage, key: string = KNOWN_SETTINGS_STORAGE_KEY): ThemeToneSettings | null {
  try {
    return parseKnownSettings(storage.getItem(key))
  } catch {
    return null
  }
}


export function rememberKnownSettings(storage: KeyValueStorage, settings: ThemeToneSettings, key: string = KNOWN_SETTINGS_STORAGE_KEY): void {
  try {
    storage.setItem(key, JSON.stringify({ lightTone: settings.lightTone, darkTone: settings.darkTone }))
  } catch {

  }
}
