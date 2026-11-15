/**
 * Per-source schedule health, shared by the three connection cards.
 *
 * Sync failures stay next to the source that produced them instead of on the calendar page:
 * - `error`: the source itself failed (e.g. Graph calendar listing returned HTTP 502);
 * - `warn`: the source is fine but one or more of its calendars failed to pull (partial);
 * - `ok` / `off`: healthy or not connected.
 */

import { HttpError } from '../../http.js'
import type { DeskCalendar, DeskScheduleSource } from '../../../contract.js'

/** Visual tone of a source's status dot. */
export type SourceTone = 'ok' | 'warn' | 'error' | 'off'

/** One calendar-level failure. */
export interface CalendarIssue {
  readonly name: string
  readonly message: string
}

/** Health summary for one source and its calendars. */
export interface SourceHealth {
  readonly tone: SourceTone
  /** Source-level failure message (when tone is `error`). */
  readonly sourceError?: string
  /** Calendar-level failure messages (when some calendars failed). */
  readonly calendarIssues: readonly CalendarIssue[]
}

/**
 * Derive the tone and messages for one source.
 * @param source - the connected source, or undefined when not connected.
 * @param calendars - calendars belonging to this source.
 * @returns the source's health summary.
 */
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

/**
 * Whether a login-poll failure is terminal for the current flow.
 *
 * The host forgets an OAuth flow once it expires (or when it restarts), and every later poll for
 * that flow id answers `409 SCHEDULE_AUTH_EXPIRED`; polling can never recover, so the card must
 * stop and offer a fresh login instead of ticking forever. Network / timeout / 5xx failures stay
 * retryable, and a 409 with another code (e.g. a revision conflict) is not a login expiry.
 */
export function isExpiredLoginFlow(reason: unknown): boolean {
  return reason instanceof HttpError && reason.code === 'SCHEDULE_AUTH_EXPIRED'
}
