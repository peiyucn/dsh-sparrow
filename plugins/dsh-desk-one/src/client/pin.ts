/**
 * Per-tab left-rail pin state.
 *
 * The base "Desk One" entry is always registered. A tab gets its own left-rail entry only after
 * the user pins it; unpinning removes that entry again. The choice lives in localStorage so it
 * survives reloads, and the dynamic panel registrations are driven from `install.ts`.
 */

import { DESK_TABS } from './app/tabs.js'
import type { Tab } from './app/types.js'

/** localStorage key holding the pinned tab ids. */
export const PINNED_TABS_STORAGE_KEY = 'dsh-desk-one.pinned-tabs'

/** The subset of Storage this module needs (tests pass a fake). */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** The page-facing pin API: read the current state and toggle one tab. */
export interface DeskPinApi {
  /** Whether the tab currently has its own left-rail entry. */
  readonly isPinned: (tab: Tab) => boolean
  /** Pin (true) or unpin (false) the tab's left-rail entry; the change is persisted. */
  readonly setPinned: (tab: Tab, pinned: boolean) => void
}

/** Browser storage, or undefined when storage is unavailable (private mode). */
function browserStorage(): StorageLike | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

/**
 * Read the persisted pinned tabs.
 * @param store - storage to read; defaults to localStorage.
 * @returns known tab ids in Desk One tab order, deduplicated; empty on any failure.
 */
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

/**
 * Persist the pinned tabs.
 * @param tabs - tab ids to keep pinned.
 * @param store - storage to write; defaults to localStorage.
 */
export function writePinnedTabs(tabs: readonly Tab[], store: StorageLike | undefined = browserStorage()): void {
  if (store === undefined) return
  try {
    const ordered = DESK_TABS.map(entry => entry.tab).filter(tab => tabs.includes(tab))
    store.setItem(PINNED_TABS_STORAGE_KEY, JSON.stringify(ordered))
  } catch {
    // A full/blocked storage only loses the preference, never the page.
  }
}
