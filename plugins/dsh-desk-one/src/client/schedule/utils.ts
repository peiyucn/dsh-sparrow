/**
 * Schedule view helpers (pure): local-day grouping, ranges and conflict detection.
 * Times arrive as UTC ISO strings; the browser's local zone decides which day a chip belongs to.
 */

import type { DeskCalendar, DeskEvent } from '../../contract.js'

export type ScheduleViewName = 'list' | 'month' | 'week'

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function keyOfEvent(event: DeskEvent): string {
  // All-day events are stored as UTC date boundaries; grouping them by the local zone would
  // shift the date in negative offsets, so their date part is authoritative.
  if (event.allDay) return event.start.slice(0, 10)
  return dayKey(new Date(event.start))
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function formatDayTitle(date: Date, today: Date, labels: { today: string; tomorrow: string }): string {
  const delta = Math.round((startOfLocalDay(date).getTime() - startOfLocalDay(today).getTime()) / 86_400_000)
  if (delta === 0) return labels.today
  if (delta === 1) return labels.tomorrow
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', weekday: 'short' })
}

export function weekdayLabel(date: Date): string {
  return date.toLocaleDateString([], { weekday: 'short' })
}

/** Month grid range (local): first visible week .. last visible week (7-day cells). */
export function monthRange(cursor: Date): { from: Date; to: Date } {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const start = addDays(first, -((first.getDay() + 6) % 7))
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
  const end = addDays(last, 7 - ((last.getDay() + 6) % 7))
  return { from: start, to: end }
}

export function weekRange(cursor: Date): { from: Date; to: Date } {
  const start = addDays(startOfLocalDay(cursor), -((cursor.getDay() + 6) % 7))
  return { from: start, to: addDays(start, 7) }
}

export function listRange(from: Date, days: number): { from: Date; to: Date } {
  return { from: startOfLocalDay(from), to: addDays(startOfLocalDay(from), days) }
}

export interface DayGroup {
  readonly key: string
  readonly date: Date
  readonly events: readonly DeskEvent[]
}

export function groupByDay(events: readonly DeskEvent[], from: Date, days: number): DayGroup[] {
  const groups: DayGroup[] = []
  for (let index = 0; index < days; index += 1) {
    const date = addDays(from, index)
    const key = dayKey(date)
    groups.push({ key, date, events: [] })
  }
  const byKey = new Map(groups.map(group => [group.key, group]))
  for (const event of events) {
    const group = byKey.get(keyOfEvent(event))
    if (group !== undefined) (group.events as DeskEvent[]).push(event)
  }
  for (const group of groups) {
    (group.events as DeskEvent[]).sort((left, right) => left.start.localeCompare(right.start))
  }
  return groups
}

/** Ids of events that overlap another busy event on the same local day (conflict hint). */
export function conflictIds(events: readonly DeskEvent[]): Set<string> {
  const busy = events.filter(event => event.busy)
  const conflicts = new Set<string>()
  for (let index = 0; index < busy.length; index += 1) {
    const left = busy[index]
    if (left === undefined) continue
    for (let other = index + 1; other < busy.length; other += 1) {
      const right = busy[other]
      if (right === undefined || keyOfEvent(left) !== keyOfEvent(right)) continue
      if (left.start < right.end && left.end > right.start && !left.allDay && !right.allDay) {
        conflicts.add(left.id)
        conflicts.add(right.id)
      }
    }
  }
  return conflicts
}

export function calendarColorOf(event: DeskEvent, calendars: readonly DeskCalendar[]): string {
  return calendars.find(calendar => calendar.id === event.calendarNodeId)?.color ?? '#7a8a99'
}

export function calendarNameOf(event: DeskEvent, calendars: readonly DeskCalendar[]): string {
  return calendars.find(calendar => calendar.id === event.calendarNodeId)?.displayName ?? ''
}

/** Block geometry for the week grid: 32px per hour, half-open [start, end). */
export const WEEK_HOUR_PX = 32

export interface WeekBlock {
  readonly event: DeskEvent
  readonly dayIndex: number
  readonly top: number
  readonly height: number
  readonly lane: number
  readonly lanes: number
}

/** Position events inside a week grid; overlapping events share the column in side-by-side lanes. */
export function weekBlocks(events: readonly DeskEvent[], from: Date): WeekBlock[] {
  const weekStart = startOfLocalDay(from).getTime()
  const byDay = new Map<number, DeskEvent[]>()
  for (const event of events) {
    if (event.allDay) continue
    const start = new Date(event.start)
    const index = Math.floor((startOfLocalDay(start).getTime() - weekStart) / 86_400_000)
    if (index < 0 || index > 6) continue
    const bucket = byDay.get(index) ?? []
    bucket.push(event)
    byDay.set(index, bucket)
  }
  const blocks: WeekBlock[] = []
  for (const [dayIndex, dayEvents] of byDay) {
    dayEvents.sort((left, right) => left.start.localeCompare(right.start))
    const lanes: DeskEvent[][] = []
    for (const event of dayEvents) {
      let placed = false
      for (const lane of lanes) {
        const last = lane[lane.length - 1]
        if (last === undefined || last.end <= event.start) {
          lane.push(event)
          placed = true
          break
        }
      }
      if (!placed) lanes.push([event])
    }
    for (const [lane, laneEvents] of lanes.entries()) {
      for (const event of laneEvents) {
        const start = new Date(event.start)
        const end = new Date(event.end)
        const top = (start.getHours() + start.getMinutes() / 60) * WEEK_HOUR_PX
        const height = Math.max(18, ((end.getTime() - start.getTime()) / 3_600_000) * WEEK_HOUR_PX)
        blocks.push({ event, dayIndex, top, height, lane, lanes: lanes.length })
      }
    }
  }
  return blocks
}
