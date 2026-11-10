/**
 * iCalendar → {@link RemoteEvent} mapping for the read-only mirror.
 *
 * ical.js is used instead of hand-rolled line parsing because WeCom emits non-IANA TZIDs whose UTC
 * offsets only exist in the embedded VTIMEZONE; registering those zones is what makes wall-clock
 * DTSTART values convertible to UTC. The zone registry is process-global, so registered zones are
 * removed in a `finally` (this function is synchronous, so two calendars cannot interleave).
 *
 * Recurring events are expanded into instances inside the pull window. `.rrule` keeps the master
 * rule text so the store can re-expand after the window moves; the instance identity is
 * `UID#RECURRENCE-ID` (non-recurring events use the bare `UID`).
 */

import ICAL from 'ical.js'
import { SCHEDULE_MAX_EVENTS } from '../../constants.js'
import { ScheduleError } from './types.js'
import type { PullWindow, RemoteEvent } from './types.js'

/**
 * Guard for pathological rules (e.g. FREQ=MINUTELY spanning years): stop expanding instead of
 * pinning the host CPU. Personal calendars stay far below this in a nine-month window.
 */
const MAX_RECURRENCE_ITERATIONS = 100_000

type IcalComponent = InstanceType<typeof ICAL.Component>
type IcalEvent = InstanceType<typeof ICAL.Event>
type IcalTime = InstanceType<typeof ICAL.Time>

interface ParseIcsOptions {
  provider: RemoteEvent['provider']
  calendarRemoteId: string
  window: PullWindow
}

interface WindowRange {
  startMs: number
  endMs: number
}

interface EventGroup {
  uid: string
  master: IcalComponent | null
  overrides: IcalComponent[]
}

export function parseIcsEvents(ics: string, opts: ParseIcsOptions): RemoteEvent[] {
  const range = toWindowRange(opts.window)
  if (ics.trim() === '') return []

  let root: IcalComponent
  try {
    root = ICAL.Component.fromString(ics)
  } catch (error) {
    throw new ScheduleError('UNSUPPORTED', `iCalendar 解析失败：${errorMessage(error)}`)
  }

  const registeredZones: string[] = []
  try {
    registerTimezones(root, registeredZones)
    const events: RemoteEvent[] = []
    for (const group of groupEvents(root).values()) {
      for (const event of eventsOfGroup(group, opts, range)) {
        if (events.length >= SCHEDULE_MAX_EVENTS) return sortAndDedupe(events)
        events.push(event)
      }
    }
    return sortAndDedupe(events)
  } finally {
    for (const tzid of registeredZones) ICAL.TimezoneService.remove(tzid)
  }
}

/** Register every embedded VTIMEZONE so TZID lookups (including non-IANA ids) resolve. */
function registerTimezones(root: IcalComponent, registered: string[]): void {
  for (const zone of root.getAllSubcomponents('vtimezone')) {
    const tzid = zone.getFirstPropertyValue('tzid')
    if (typeof tzid !== 'string' || tzid.trim() === '') continue
    ICAL.TimezoneService.register(zone)
    registered.push(tzid)
  }
}

function groupEvents(root: IcalComponent): Map<string, EventGroup> {
  const groups = new Map<string, EventGroup>()
  for (const component of root.getAllSubcomponents('vevent')) {
    const uidValue = component.getFirstPropertyValue('uid')
    if (typeof uidValue !== 'string' || uidValue.trim() === '') continue
    const uid = uidValue.trim()
    let group = groups.get(uid)
    if (group === undefined) {
      group = { uid, master: null, overrides: [] }
      groups.set(uid, group)
    }
    if (component.hasProperty('recurrence-id')) {
      group.overrides.push(component)
    } else if (group.master === null) {
      // The RFC forbids two masters with one UID; keep the first instead of failing the calendar.
      group.master = component
    }
  }
  return groups
}

function eventsOfGroup(group: EventGroup, opts: ParseIcsOptions, range: WindowRange): RemoteEvent[] {
  if (group.master === null) {
    // A lone override is malformed, but showing the moved instance beats dropping the calendar.
    return group.overrides.flatMap(component => standaloneOverrideEvents(component, group.uid, opts, range))
  }
  const master = createEvent(group.master, group.overrides)
  if (statusOf(master) === 'CANCELLED') return []
  const rrule = rruleText(group.master)
  if (!master.isRecurring()) {
    // ical.js auto-relates sibling RECURRENCE-ID components regardless of UID, so never construct
    // an event without explicit exceptions (here: none, because a non-recurring master has none).
    // Overrides attached to a non-recurring master are malformed; dropping them beats duplicating.
    const single = singleEvent(master, group.uid, opts, range, rrule)
    return single === null ? [] : [single]
  }
  return recurringEvents(master, group.overrides, group.uid, opts, range, rrule)
}

/**
 * Never pass the component alone: ical.js then auto-relates EVERY sibling VEVENT carrying a
 * RECURRENCE-ID (regardless of UID), which cross-wires unrelated series. Explicit exceptions keep
 * each UID group isolated.
 */
function createEvent(component: IcalComponent, exceptions: IcalComponent[] = []): IcalEvent {
  return new ICAL.Event(component, { exceptions })
}

function singleEvent(
  event: IcalEvent,
  uid: string,
  opts: ParseIcsOptions,
  range: WindowRange,
  rrule: string | undefined,
): RemoteEvent | null {
  const start = asIcalTime(event.startDate)
  if (start === null) return null
  const end = asIcalTime(event.endDate) ?? start
  const startMs = timeToMs(start)
  const endMs = timeToMs(end)
  if (!intersectsWindow(startMs, endMs, range)) return null
  return buildRemoteEvent({ uid, start, end, event, busy: isBusy(event), url: eventUrl(event), rrule }, opts)
}

function recurringEvents(
  master: IcalEvent,
  overrides: IcalComponent[],
  uid: string,
  opts: ParseIcsOptions,
  range: WindowRange,
  rrule: string | undefined,
): RemoteEvent[] {
  const events: RemoteEvent[] = []
  const emitted = new Set<string>()
  const iterator = master.iterator()
  let iterations = 0
  for (;;) {
    const occurrence = iterator.next()
    if (!isIcalTime(occurrence)) break
    iterations += 1
    if (iterations > MAX_RECURRENCE_ITERATIONS) break
    const occurrenceMs = timeToMs(occurrence)
    // RecurExpansion yields occurrences in ascending order; later starts cannot re-enter the window.
    if (occurrenceMs >= range.endMs) break
    const recurrenceId = occurrenceKey(occurrence)
    emitted.add(recurrenceId)
    const details = master.getOccurrenceDetails(occurrence)
    const item = details.item
    if (statusOf(item) === 'CANCELLED') continue
    const start = asIcalTime(details.startDate)
    if (start === null) continue
    const end = asIcalTime(details.endDate) ?? start
    const startMs = timeToMs(start)
    const endMs = timeToMs(end)
    if (!intersectsWindow(startMs, endMs, range)) continue
    events.push(buildRemoteEvent({
      uid,
      recurrenceId,
      start,
      end,
      event: item,
      busy: isBusy(item),
      url: eventUrl(item),
      rrule,
    }, opts))
  }

  // Overrides the iterator never produced still belong in the mirror: EXDATE / COUNT exhaustion,
  // or an instance moved in from outside the window. Emit just those that intersect the window.
  for (const overrideComponent of overrides) {
    const override = createEvent(overrideComponent)
    if (statusOf(override) === 'CANCELLED') continue
    const recurrenceIdTime = asIcalTime(override.recurrenceId)
    if (recurrenceIdTime === null) continue
    const recurrenceId = occurrenceKey(recurrenceIdTime)
    if (emitted.has(recurrenceId)) continue
    const start = asIcalTime(override.startDate)
    if (start === null) continue
    const end = asIcalTime(override.endDate) ?? start
    if (!intersectsWindow(timeToMs(start), timeToMs(end), range)) continue
    events.push(buildRemoteEvent({
      uid,
      recurrenceId,
      start,
      end,
      event: override,
      busy: isBusy(override),
      url: eventUrl(override),
      rrule,
    }, opts))
  }
  return events
}

function standaloneOverrideEvents(
  component: IcalComponent,
  uid: string,
  opts: ParseIcsOptions,
  range: WindowRange,
): RemoteEvent[] {
  const override = createEvent(component)
  if (statusOf(override) === 'CANCELLED') return []
  const recurrenceIdTime = asIcalTime(override.recurrenceId)
  if (recurrenceIdTime === null) return []
  const start = asIcalTime(override.startDate)
  if (start === null) return []
  const end = asIcalTime(override.endDate) ?? start
  if (!intersectsWindow(timeToMs(start), timeToMs(end), range)) return []
  return [buildRemoteEvent({
    uid,
    recurrenceId: occurrenceKey(recurrenceIdTime),
    start,
    end,
    event: override,
    busy: isBusy(override),
    url: eventUrl(override),
  }, opts)]
}

interface BuildEventInput {
  uid: string
  recurrenceId?: string
  start: IcalTime
  end: IcalTime
  event: IcalEvent
  busy: boolean
  url?: string
  rrule?: string
}

function buildRemoteEvent(input: BuildEventInput, opts: ParseIcsOptions): RemoteEvent {
  const allDay = input.start.isDate
  const event: RemoteEvent = {
    provider: opts.provider,
    calendarRemoteId: opts.calendarRemoteId,
    externalId: input.recurrenceId === undefined ? input.uid : `${input.uid}#${input.recurrenceId}`,
    uid: input.uid,
    title: textValue(input.event.summary),
    startUtc: new Date(timeToMs(input.start)).toISOString(),
    endUtc: new Date(timeToMs(input.end)).toISOString(),
    allDay,
    // An all-day DATE carries no TZID; anchoring it at midnight UTC keeps the UTC date equal to the
    // event date on every host (the client must render all-day events from the UTC date, not shift).
    timezone: allDay ? 'UTC' : zoneName(input.start),
    busy: input.busy,
  }
  if (input.recurrenceId !== undefined) event.recurrenceId = input.recurrenceId
  const description = textValue(input.event.description)
  if (description !== '') event.description = description
  const location = textValue(input.event.location)
  if (location !== '') event.location = location
  if (input.url !== undefined) event.url = input.url
  if (input.rrule !== undefined) event.rrule = input.rrule
  return event
}

function timeToMs(time: IcalTime): number {
  if (time.isDate) return Date.UTC(time.year, time.month - 1, time.day)
  if (time.zone === ICAL.Timezone.localTimezone) {
    // A floating time (or a TZID whose VTIMEZONE is missing) has no real UTC anchor. Treat the
    // wall clock as UTC instead of asking the process timezone: the result is deterministic and
    // `timezone` says UTC instead of silently claiming a local zone the server never sent.
    return Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second)
  }
  return time.convertToZone(ICAL.Timezone.utcTimezone).toJSDate().getTime()
}

function zoneName(time: IcalTime): string {
  if (time.isDate || time.zone === ICAL.Timezone.localTimezone) return 'UTC'
  const tzid = time.zone.tzid
  return typeof tzid === 'string' && tzid !== '' ? tzid : 'UTC'
}

/** Canonical instance identity: UTC-normalised RECURRENCE-ID (`20261110T010000Z`, dates `20261110`). */
function occurrenceKey(time: IcalTime): string {
  return time.convertToZone(ICAL.Timezone.utcTimezone).toICALString()
}

function statusOf(event: IcalEvent): string {
  const status = event.component.getFirstPropertyValue('status')
  return typeof status === 'string' ? status.trim().toUpperCase() : ''
}

function isBusy(event: IcalEvent): boolean {
  const transp = event.component.getFirstPropertyValue('transp')
  return !(typeof transp === 'string' && transp.trim().toUpperCase() === 'TRANSPARENT')
}

function eventUrl(event: IcalEvent): string | undefined {
  const value = event.component.getFirstPropertyValue('url')
  if (typeof value !== 'string') return undefined
  const url = value.trim()
  // Only http(s): the client renders this as a "jump to source" link, so javascript:/data: must die here.
  return /^https?:\/\//i.test(url) ? url : undefined
}

function rruleText(master: IcalComponent): string | undefined {
  const property = master.getFirstProperty('rrule')
  return property === null ? undefined : property.toICALString()
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function intersectsWindow(startMs: number, endMs: number, range: WindowRange): boolean {
  // Half-open overlap; zero-length events count when their start is inside the window.
  if (endMs <= startMs) return startMs >= range.startMs && startMs < range.endMs
  return startMs < range.endMs && endMs > range.startMs
}

function toWindowRange(window: PullWindow): WindowRange {
  const startMs = Date.parse(window.startUtc)
  const endMs = Date.parse(window.endUtc)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new ScheduleError('UNSUPPORTED', '拉取窗口的起止时间不合法（需要 startUtc < endUtc 的 ISO 时间）')
  }
  return { startMs, endMs }
}

/** Sort by start then identity so repeated pulls keep a stable order; duplicate ids keep the first. */
function sortAndDedupe(events: RemoteEvent[]): RemoteEvent[] {
  const unique = new Map<string, RemoteEvent>()
  for (const event of events) {
    if (!unique.has(event.externalId)) unique.set(event.externalId, event)
  }
  return [...unique.values()].sort((left, right) => {
    if (left.startUtc !== right.startUtc) return left.startUtc < right.startUtc ? -1 : 1
    return left.externalId < right.externalId ? -1 : left.externalId > right.externalId ? 1 : 0
  })
}

function isIcalTime(value: unknown): value is IcalTime {
  return value instanceof ICAL.Time
}

function asIcalTime(value: unknown): IcalTime | null {
  return value instanceof ICAL.Time ? value : null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
