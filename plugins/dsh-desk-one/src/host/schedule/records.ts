/**
 * Pure record helpers for the schedule mirror (host half).
 *
 * No Node/browser APIs: the store and route tests drive these directly. External data (CalDAV /
 * ICS) is normalised by the adapters; this module only turns remote drafts into stored records
 * and answers range queries.
 */

import { randomUUID } from 'node:crypto'
import { SCHEDULE_COLORS } from '../../constants.js'
import type {
  DeskCalendar, DeskEvent, DeskScheduleSource, ScheduleSyncError,
} from '../../contract.js'
import type { ScheduleChannel, ScheduleProvider } from '../../constants.js'

/** What an adapter produces for one event instance (times already normalised to UTC ISO). */
export interface EventDraft {
  readonly externalId: string
  readonly uid: string
  readonly recurrenceId?: string
  readonly title: string
  readonly description?: string
  readonly location?: string
  readonly start: string
  readonly end: string
  readonly allDay: boolean
  readonly timezone: string
  readonly busy: boolean
  readonly url?: string
  readonly rrule?: string
}

export interface CalendarDraft {
  readonly remoteId: string
  readonly displayName: string
}

/** Deterministic colour assignment: stable for a given order, wrapped around the palette. */
export function colorForOrder(order: number): string {
  return SCHEDULE_COLORS[((order % SCHEDULE_COLORS.length) + SCHEDULE_COLORS.length) % SCHEDULE_COLORS.length] ?? SCHEDULE_COLORS[0]
}

export function createScheduleSourceRecord(
  input: { readonly provider: ScheduleProvider; readonly channel: ScheduleChannel; readonly account?: string; readonly credentialRef?: string },
  meta: { readonly id?: string; readonly now: string },
): DeskScheduleSource {
  return {
    id: meta.id ?? `source_${randomUUID()}`,
    kind: 'schedule-source',
    schema: 1,
    provider: input.provider,
    channel: input.channel,
    ...(input.account === undefined ? {} : { account: input.account }),
    ...(input.credentialRef === undefined ? {} : { credentialRef: input.credentialRef }),
    enabled: true,
    syncState: 'idle',
    createdAt: meta.now,
    updatedAt: meta.now,
    revision: 1,
  }
}

export function createCalendarRecord(
  input: {
    readonly sourceId: string
    readonly provider: ScheduleProvider
    readonly channel: ScheduleChannel
    readonly remoteId: string
    readonly displayName: string
    readonly order: number
  },
  meta: { readonly id?: string; readonly now: string },
): DeskCalendar {
  return {
    id: meta.id ?? `calendar_${randomUUID()}`,
    kind: 'calendar',
    schema: 1,
    sourceId: input.sourceId,
    provider: input.provider,
    channel: input.channel,
    remoteId: input.remoteId,
    displayName: input.displayName === '' ? input.remoteId : input.displayName,
    color: colorForOrder(input.order),
    order: input.order,
    enabled: true,
    readOnly: true,
    createdAt: meta.now,
    updatedAt: meta.now,
    revision: 1,
  }
}

export function createEventRecord(
  draft: EventDraft,
  meta: {
    readonly calendarNodeId: string
    readonly provider: ScheduleProvider
    readonly channel: ScheduleChannel
    readonly calendarRemoteId: string
    readonly now: string
    readonly id?: string
  },
): DeskEvent {
  return {
    id: meta.id ?? `event_${randomUUID()}`,
    kind: 'event',
    schema: 1,
    calendarNodeId: meta.calendarNodeId,
    provider: meta.provider,
    channel: meta.channel,
    calendarRemoteId: meta.calendarRemoteId,
    externalId: draft.externalId,
    uid: draft.uid,
    ...(draft.recurrenceId === undefined ? {} : { recurrenceId: draft.recurrenceId }),
    title: draft.title,
    ...(draft.description === undefined ? {} : { description: draft.description }),
    ...(draft.location === undefined ? {} : { location: draft.location }),
    start: draft.start,
    end: draft.end,
    allDay: draft.allDay,
    timezone: draft.timezone,
    busy: draft.busy,
    ...(draft.url === undefined ? {} : { url: draft.url }),
    ...(draft.rrule === undefined ? {} : { rrule: draft.rrule }),
    createdAt: meta.now,
    updatedAt: meta.now,
    revision: 1,
  }
}

/** True when a stored event already carries everything the fresh draft has (skip the write). */
export function eventMatchesDraft(event: DeskEvent, draft: EventDraft): boolean {
  return event.externalId === draft.externalId
    && event.uid === draft.uid
    && event.recurrenceId === draft.recurrenceId
    && event.title === draft.title
    && event.description === draft.description
    && event.location === draft.location
    && event.start === draft.start
    && event.end === draft.end
    && event.allDay === draft.allDay
    && event.timezone === draft.timezone
    && event.busy === draft.busy
    && event.url === draft.url
    && event.rrule === draft.rrule
}

/** ISO instants compare lexicographically only when the timezone suffix is identical (Z). */
function eventOverlaps(event: Pick<DeskEvent, 'start' | 'end'>, from: string, to: string): boolean {
  return event.start < to && event.end > from
}

export function sortEvents(events: readonly DeskEvent[]): DeskEvent[] {
  return [...events].sort((left, right) =>
    left.start.localeCompare(right.start)
    || right.end.localeCompare(left.end)
    || left.id.localeCompare(right.id))
}

export interface EventQuery {
  readonly from: string
  readonly to: string
  readonly calendarIds?: readonly string[]
  readonly provider?: ScheduleProvider
}

/** Range query over the mirrored events: half-open [from, to) overlap, optional calendar/provider filter. */
export function filterEvents(events: readonly DeskEvent[], query: EventQuery): DeskEvent[] {
  const calendarIds = query.calendarIds === undefined ? undefined : new Set(query.calendarIds)
  return sortEvents(events.filter(event =>
    eventOverlaps(event, query.from, query.to)
    && (calendarIds === undefined || calendarIds.has(event.calendarNodeId))
    && (query.provider === undefined || event.provider === query.provider)))
}

/** Normalised failure record for the source / calendar rows (never contains a secret). */
export function scheduleErrorOf(error: unknown): ScheduleSyncError {
  if (error instanceof Error) {
    const code = typeof (error as { code?: unknown }).code === 'string'
      ? String((error as { code?: unknown }).code)
      : 'SYNC_FAILED'
    return { code, message: error.message, at: new Date().toISOString() }
  }
  return { code: 'SYNC_FAILED', message: String(error), at: new Date().toISOString() }
}
