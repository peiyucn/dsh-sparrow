/** Single source of truth for DeskOne's tab order (also used by the overflow menu). */

import type { Tab } from './types.js'

export interface DeskTabEntry {
  readonly tab: Tab
  readonly labelKey: 'tab.notebook' | 'tab.notes' | 'tab.tasks' | 'tab.schedule' | 'tab.sessions'
}

export const DESK_TABS: readonly DeskTabEntry[] = [
  // Quick capture leads: writing a thought down is the most frequent visit and needs no setup.
  { tab: 'notes', labelKey: 'tab.notes' },
  { tab: 'tasks', labelKey: 'tab.tasks' },
  // The notebook is the flagship workspace but needs a linked library, so the two zero-setup tabs
  // come first and this one follows them.
  { tab: 'notebook', labelKey: 'tab.notebook' },
  // Read-only mirror and management: they trail the writing surfaces.
  { tab: 'schedule', labelKey: 'tab.schedule' },
  { tab: 'sessions', labelKey: 'tab.sessions' },
]

/**
 * Tabs that live only in the trailing More menu. Move an entry here when the visible
 * strip should stop growing; the header filters DESK_TABS by this list.
 */
export const MORE_TABS: readonly Tab[] = []

export const VISIBLE_TABS: readonly DeskTabEntry[] = DESK_TABS.filter(entry => !MORE_TABS.includes(entry.tab))

export const OVERFLOW_TABS: readonly DeskTabEntry[] = DESK_TABS.filter(entry => MORE_TABS.includes(entry.tab))
