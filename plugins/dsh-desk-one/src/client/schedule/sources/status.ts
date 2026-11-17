

import { HttpError } from '../../http.js'
import type { DeskCalendar, DeskScheduleSource } from '../../../contract.js'


export type SourceTone = 'ok' | 'warn' | 'error' | 'off'


export interface CalendarIssue {
  readonly name: string
  readonly message: string
}


export interface SourceHealth {
  readonly tone: SourceTone

  readonly sourceError?: string

  readonly calendarIssues: readonly CalendarIssue[]
}


export function sourceHealth(source: DeskScheduleSource | undefined, calendars: readonly DeskCalendar[]): SourceHealth {
  if (source === undefined) return { tone: 'off', calendarIssues: [] }
  const calendarIssues = calendars
    .filter(calendar => calendar.lastError !== undefined)
    .map(calendar => ({ name: calendar.displayName, message: calendar.lastError?.message ?? '' }))
  if (source.syncState === 'error') {
    return {
      tone: 'error',
      ...source.lastError === undefined ? {} : { sourceError: source.lastError.message },
      calendarIssues,
    }
  }
  if (calendarIssues.length > 0) return { tone: 'warn', calendarIssues }
  return { tone: 'ok', calendarIssues: [] }
}


export function isExpiredLoginFlow(reason: unknown): boolean {
  return reason instanceof HttpError && reason.code === 'SCHEDULE_AUTH_EXPIRED'
}
