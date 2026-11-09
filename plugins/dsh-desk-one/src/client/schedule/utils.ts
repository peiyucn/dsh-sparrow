/** Pure client-side date/event helpers for the schedule page (unit-tested). */

import type { DeskCalendar, DeskEvent } from '../../contract.js'
import type { DeskTranslator } from '../app/types.js'

export type ScheduleViewName = 'list' | 'month' | 'week'

const DAY_MS = 86_400_000

/** Local midnight of the given date. */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/** Local date key `YYYY-MM-DD` (not UTC, so late-evening events stay on their local day). */
export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** 24h wall clock, locale-independent so the UI never mixes AM/PM with a Chinese shell. */
export function formatTime(iso: string): string {
  const date = new Date(iso)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

/** `日/一/二/…` (or English short names) parsed from the locale dictionary. */
export function weekdayLabels(value: string): string[] {
  return value.split(',').map(part => part.trim())
}

export function weekdayLabel(date: Date, labels: readonly string[]): string {
  // Labels are Monday-first (Chinese convention), so map Sunday=0 to the last slot.
  return labels[(date.getDay() + 6) % 7] ?? ''
}

export function formatDateLabel(date: Date, t: DeskTranslator): string {
  return t('schedule.dateFormat', { month: date.getMonth() + 1, day: date.getDate() })
}

/** Full date for the calendar view's range label ("具体哪天"). */
export function formatFullDateLabel(date: Date, t: DeskTranslator): string {
  return t('schedule.dateFormatFull', { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() })
}

export function formatMonthLabel(date: Date, t: DeskTranslator): string {
  const names = t('schedule.monthNames').split(',')
  const month = names[date.getMonth()] ?? String(date.getMonth() + 1)
  return t('schedule.monthLabel', { year: date.getFullYear(), month })
}

/** Week start (Monday) of the given date, at local midnight. */
export function weekStartOf(date: Date): Date {
  return addDays(startOfLocalDay(date), -((date.getDay() + 6) % 7))
}

export function formatDayTitle(date: Date, today: Date, labels: { today: string; tomorrow: string }, format: (date: Date) => string): string {
  const delta = Math.round((startOfLocalDay(date).getTime() - startOfLocalDay(today).getTime()) / DAY_MS)
  if (delta === 0) return labels.today
  if (delta === 1) return labels.tomorrow
  return format(date)
}

/** Month grid range (local): first visible week (Monday) .. Monday after the last visible week. */
export function monthRange(cursor: Date): { from: Date; to: Date } {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const from = weekStartOf(first)
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
  const to = addDays(weekStartOf(last), 7)
  return { from, to }
}

/** Week grid range (local Monday .. next Monday, exclusive). */
export function weekRange(cursor: Date): { from: Date; to: Date } {
  const from = weekStartOf(cursor)
  return { from, to: addDays(from, 7) }
}

/** Agenda window from a local day; `days` is inclusive of the start day. */
export function listRange(from: Date, days: number): { from: Date; to: Date } {
  const start = startOfLocalDay(from)
  return { from: start, to: addDays(start, days) }
}

/** Stable per-event key for grouping (local day of the event's start). */
export function keyOfEvent(event: DeskEvent): string {
  return dayKey(new Date(event.start))
}

/** Group events into local days covering [today, today + days). Days without events stay empty. */
export function groupByDay(events: readonly DeskEvent[], today: Date, days: number): Array<{ key: string; date: Date; events: DeskEvent[] }> {
  const start = startOfLocalDay(today)
  const groups = Array.from({ length: days }, (_, index) => {
    const date = addDays(start, index)
    return { key: dayKey(date), date, events: [] as DeskEvent[] }
  })
  const byKey = new Map(groups.map(group => [group.key, group]))
  for (const event of events) {
    byKey.get(keyOfEvent(event))?.events.push(event)
  }
  for (const group of groups) group.events.sort((left, right) => left.start.localeCompare(right.start))
  return groups
}

/** Week grid geometry in percentages of the full day so the grid is a fixed 24h canvas. */
export interface WeekBlock {
  readonly event: DeskEvent
  readonly dayIndex: number
  readonly topPct: number
  readonly heightPct: number
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
    const index = Math.floor((startOfLocalDay(start).getTime() - weekStart) / DAY_MS)
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
        const startMinutes = start.getHours() * 60 + start.getMinutes()
        const durationMinutes = Math.max(15, (end.getTime() - start.getTime()) / 60_000)
        blocks.push({
          event,
          dayIndex,
          topPct: (startMinutes / 1440) * 100,
          heightPct: Math.max(1.4, (durationMinutes / 1440) * 100),
          lane,
          lanes: lanes.length,
        })
      }
    }
  }
  return blocks
}

/** Ids of busy timed events that overlap another busy event on the same local day. */
export function conflictIds(events: readonly DeskEvent[]): Set<string> {
  const byDay = new Map<string, DeskEvent[]>()
  for (const event of events) {
    if (event.allDay || !event.busy) continue
    const key = keyOfEvent(event)
    const bucket = byDay.get(key) ?? []
    bucket.push(event)
    byDay.set(key, bucket)
  }
  const conflicts = new Set<string>()
  for (const dayEvents of byDay.values()) {
    dayEvents.sort((left, right) => left.start.localeCompare(right.start))
    for (let index = 0; index < dayEvents.length; index += 1) {
      const current = dayEvents[index]
      if (current === undefined) continue
      for (let next = index + 1; next < dayEvents.length; next += 1) {
        const other = dayEvents[next]
        if (other === undefined || other.start >= current.end) break
        if (other.start < current.end && other.end > current.start) {
          conflicts.add(current.id)
          conflicts.add(other.id)
        }
      }
    }
  }
  return conflicts
}

export function calendarColorOf(event: DeskEvent, calendars: readonly DeskCalendar[]): string {
  return calendars.find(calendar => calendar.id === event.calendarNodeId)?.color ?? '#8a919f'
}

export function calendarNameOf(event: DeskEvent, calendars: readonly DeskCalendar[]): string {
  return calendars.find(calendar => calendar.id === event.calendarNodeId)?.displayName ?? ''
}
