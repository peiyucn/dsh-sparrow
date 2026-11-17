

import type { Tab } from './types.js'

export interface DeskTabEntry {
  readonly tab: Tab
  readonly labelKey: 'tab.notebook' | 'tab.notes' | 'tab.tasks' | 'tab.schedule' | 'tab.sessions'
}

export const DESK_TABS: readonly DeskTabEntry[] = [

  { tab: 'notes', labelKey: 'tab.notes' },
  { tab: 'tasks', labelKey: 'tab.tasks' },


  { tab: 'notebook', labelKey: 'tab.notebook' },

  { tab: 'schedule', labelKey: 'tab.schedule' },
  { tab: 'sessions', labelKey: 'tab.sessions' },
]


export const MORE_TABS: readonly Tab[] = []

export const VISIBLE_TABS: readonly DeskTabEntry[] = DESK_TABS.filter(entry => !MORE_TABS.includes(entry.tab))

export const OVERFLOW_TABS: readonly DeskTabEntry[] = DESK_TABS.filter(entry => MORE_TABS.includes(entry.tab))
