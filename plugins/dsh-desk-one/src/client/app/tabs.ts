/** Single source of truth for DeskOne's tab order (also used by the overflow menu). */

import type { Tab } from './types.js'

export interface DeskTabEntry {
  readonly tab: Tab
  readonly labelKey: 'tab.overview' | 'tab.notes' | 'tab.tasks' | 'tab.schedule' | 'tab.sessions'
}

export const DESK_TABS: readonly DeskTabEntry[] = [
  { tab: 'overview', labelKey: 'tab.overview' },
  { tab: 'notes', labelKey: 'tab.notes' },
  { tab: 'tasks', labelKey: 'tab.tasks' },
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
