/** Single source of truth for DeskOne's tab order (also used by the overflow menu). */

import type { Tab } from './types.js'

export interface DeskTabEntry {
  readonly tab: Tab
  readonly labelKey: 'tab.overview' | 'tab.notes' | 'tab.tasks' | 'tab.sessions'
}

export const DESK_TABS: readonly DeskTabEntry[] = [
  { tab: 'overview', labelKey: 'tab.overview' },
  { tab: 'notes', labelKey: 'tab.notes' },
  { tab: 'tasks', labelKey: 'tab.tasks' },
  { tab: 'sessions', labelKey: 'tab.sessions' },
]
