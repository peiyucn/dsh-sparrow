/**
 * Domain types for the schedule module (S2, read-only aggregation).
 *
 * Kept dependency-free so the adapters, the store mapping and the tests all agree on one
 * vocabulary. Only {@link ScheduleError} has behavior: every adapter must classify failures the
 * same way (auth vs transient vs unsupported) for the UI to offer the right next action.
 */

export type CalendarProvider = 'wecom' | 'icloud' | 'outlook' | 'ics'

/** One remote calendar. `order` preserves the server-side order for the source → calendar tree. */
export interface RemoteCalendar {
  provider: CalendarProvider
  remoteId: string
  displayName: string
  order: number
}

/** One event instance, already expanded (recurrence) and normalised to UTC. */
export interface RemoteEvent {
  provider: CalendarProvider
  calendarRemoteId: string
  /** Remote identity: `UID` for single events, `UID#RECURRENCE-ID` for expanded instances. */
  externalId: string
  uid: string
  recurrenceId?: string
  title: string
  description?: string
  location?: string
  startUtc: string
  endUtc: string
  allDay: boolean
  /** IANA name when the VTIMEZONE declared one; the literal TZID otherwise; `UTC` when unknown. */
  timezone: string
  busy: boolean
  url?: string
  rrule?: string
}

/** Half-open time window `[startUtc, endUtc)` used for pulling and expanding recurrences. */
export interface PullWindow {
  startUtc: string
  endUtc: string
}

/**
 * Failure classes shared by every source:
 * - `AUTH_EXPIRED` needs a new password / re-published ICS link, never an automatic retry.
 * - `TRANSIENT` is a network / 5xx / rate-limit failure and may be retried with backoff.
 * - `UNSUPPORTED` means the server answered with something this adapter cannot map.
 */
export type SyncErrorKind = 'AUTH_EXPIRED' | 'TRANSIENT' | 'UNSUPPORTED'

export class ScheduleError extends Error {
  constructor(readonly kind: SyncErrorKind, message: string, readonly code?: string) {
    super(message)
    this.name = 'ScheduleError'
  }
}
