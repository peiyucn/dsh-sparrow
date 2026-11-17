

import { DESK_TABS } from './app/tabs.js'
import type { Tab } from './app/types.js'


export const PINNED_TABS_STORAGE_KEY = 'dsh-desk-one.pinned-tabs'


export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}


export interface DeskPinApi {

  readonly isPinned: (tab: Tab) => boolean

  readonly setPinned: (tab: Tab, pinned: boolean) => void
}


function browserStorage(): StorageLike | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}


export function readPinnedTabs(store: StorageLike | undefined = browserStorage()): readonly Tab[] {
  if (store === undefined) return []
  try {
    const raw = store.getItem(PINNED_TABS_STORAGE_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const known = new Set(parsed.filter((value): value is Tab => typeof value === 'string'))
    return DESK_TABS.map(entry => entry.tab).filter(tab => known.has(tab))
  } catch {
    return []
  }
}


export function writePinnedTabs(tabs: readonly Tab[], store: StorageLike | undefined = browserStorage()): void {
  if (store === undefined) return
  try {
    const ordered = DESK_TABS.map(entry => entry.tab).filter(tab => tabs.includes(tab))
    store.setItem(PINNED_TABS_STORAGE_KEY, JSON.stringify(ordered))
  } catch {

  }
}
