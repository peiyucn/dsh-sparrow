/** Props shared by the calendar-settings page and its cards. */

import type { DeskCalendar, DeskScheduleSource } from '../../../contract.js'
import type { DeskTranslator } from '../../app/types.js'
import type { ScheduleApi } from '../api.js'

export interface SourcesPageProps {
  readonly t: DeskTranslator
  readonly api: ScheduleApi
  readonly sources: readonly DeskScheduleSource[]
  readonly calendars: readonly DeskCalendar[]
  readonly counts: Readonly<Record<string, number>>
  readonly hidden: Set<string>
  readonly onToggle: (calendar: DeskCalendar) => void
  readonly onColor: (calendar: DeskCalendar) => Promise<void>
  readonly onSetEnabled: (calendar: DeskCalendar, enabled: boolean) => Promise<void>
  readonly onChanged: () => Promise<void>
  /** Manual force-sync lives here: pulling calendars is part of source management. */
  readonly onSync: () => void
  readonly syncing: boolean
  /** Sync/load failure surfaced here, because the calendar toolbar is not on this page. */
  readonly syncError: string | null
}

/**
 * One source card: status header, in-card calendar selection and a collapsible connection form.
 * A configured source keeps its form collapsed; the whole block (connection + calendars) is one
 * surface instead of two stacked boxes.
 */
