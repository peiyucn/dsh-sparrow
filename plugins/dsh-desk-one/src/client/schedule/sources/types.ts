

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

  readonly onSync: () => void
  readonly syncing: boolean

  readonly syncError: string | null
}
