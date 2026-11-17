

import type { DeskCalendar, DeskEvent } from '../../contract.js'
import type { DeskTranslator } from '../app/types.js'

export type ScheduleViewName = 'list' | 'month' | 'week'

const DAY_MS = 86_400_000


export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}


export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}


export function formatClock24h(iso: string): string {
  const date = new Date(iso)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}


export function weekdayLabels(value: string): string[] {
  return value.split(',').map(part => part.trim())
}

export function weekdayLabel(date: Date, labels: readonly string[]): string {

  return labels[(date.getDay() + 6) % 7] ?? ''
}

export function formatDateLabel(date: Date, t: DeskTranslator): string {
  return t('schedule.dateFormat', { month: date.getMonth() + 1, day: date.getDate() })
}


export function formatFullDateLabel(date: Date, t: DeskTranslator): string {
  return t('schedule.dateFormatFull', { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() })
}

export function formatMonthLabel(date: Date, t: DeskTranslator): string {
  const names = t('schedule.monthNames').split(',')
  const month = names[date.getMonth()] ?? String(date.getMonth() + 1)
  return t('schedule.monthLabel', { year: date.getFullYear(), month })
}


function weekStartOf(date: Date): Date {
  return addDays(startOfLocalDay(date), -((date.getDay() + 6) % 7))
}


export function isoWeekNumber(date: Date): number {

  const thursday = addDays(startOfLocalDay(date), 3 - ((date.getDay() + 6) % 7))
  const firstThursday = (() => {
    const jan4 = new Date(thursday.getFullYear(), 0, 4)
    return addDays(startOfLocalDay(jan4), 3 - ((jan4.getDay() + 6) % 7))
  })()
  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * DAY_MS))
}

export function formatDayTitle(date: Date, today: Date, labels: { today: string; tomorrow: string }, format: (date: Date) => string): string {
  const delta = Math.round((startOfLocalDay(date).getTime() - startOfLocalDay(today).getTime()) / DAY_MS)
  if (delta === 0) return labels.today
  if (delta === 1) return labels.tomorrow
  return format(date)
}


export function monthRange(cursor: Date): { from: Date; to: Date } {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const from = weekStartOf(first)
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
  const to = addDays(weekStartOf(last), 7)
  return { from, to }
}


export function weekRange(cursor: Date): { from: Date; to: Date } {
  const from = weekStartOf(cursor)
  return { from, to: addDays(from, 7) }
}


export function listRange(from: Date, days: number): { from: Date; to: Date } {
  const start = startOfLocalDay(from)
  return { from: start, to: addDays(start, days) }
}


export function keyOfEvent(event: DeskEvent): string {
  return dayKey(new Date(event.start))
}


const MAX_SPAN_DAYS = 366


export function eventDayKeys(event: DeskEvent): string[] {
  const startMs = Date.parse(event.start)
  if (!Number.isFinite(startMs)) return []
  const endMs = Date.parse(event.end)
  const start = new Date(startMs)

  if (event.allDay) {
    const firstKey = start.toISOString().slice(0, 10)
    if (!Number.isFinite(endMs) || endMs <= startMs) return [firstKey]
    const keys: string[] = []
    for (let cursor = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
      cursor < endMs && keys.length < MAX_SPAN_DAYS;
      cursor += DAY_MS) {
      keys.push(new Date(cursor).toISOString().slice(0, 10))
    }
    return keys.length === 0 ? [firstKey] : keys
  }


  const last = new Date(Number.isFinite(endMs) && endMs > startMs ? endMs - 1 : startMs)
  const keys: string[] = []
  for (let day = startOfLocalDay(start); day <= last && keys.length < MAX_SPAN_DAYS; day = addDays(day, 1)) {
    keys.push(dayKey(day))
  }
  return keys.length === 0 ? [dayKey(start)] : keys
}


export function coversDayKey(event: DeskEvent, key: string): boolean {
  return eventDayKeys(event).includes(key)
}


export function isMultiDay(event: DeskEvent): boolean {
  return eventDayKeys(event).length > 1
}


export interface SpanBar {
  readonly event: DeskEvent
  readonly startIndex: number
  readonly span: number

  readonly continuesBefore: boolean

  readonly continuesAfter: boolean
}


export function spanBars(events: readonly DeskEvent[], days: readonly Date[]): SpanBar[] {
  if (days.length === 0) return []
  const keys = days.map((day) => dayKey(day))
  const firstKey = keys[0] ?? ''
  const lastKey = keys[keys.length - 1] ?? ''
  const bars: SpanBar[] = []
  for (const event of events) {
    const own = eventDayKeys(event)
    if (own.length <= 1) continue
    const eventFirst = own[0] ?? ''
    const eventLast = own[own.length - 1] ?? ''
    let startIndex = -1
    let endIndex = -1
    for (let index = 0; index < keys.length; index++) {
      const key = keys[index] ?? ''
      if (key < eventFirst || key > eventLast) continue
      if (startIndex < 0) startIndex = index
      endIndex = index
    }
    if (startIndex < 0 || endIndex < startIndex) continue
    bars.push({
      event,
      startIndex,
      span: endIndex - startIndex + 1,
      continuesBefore: eventFirst < firstKey,
      continuesAfter: eventLast > lastKey,
    })
  }
  return bars.sort((left, right) =>
    left.startIndex - right.startIndex
    || right.span - left.span
    || left.event.start.localeCompare(right.event.start))
}


export function groupByDay(events: readonly DeskEvent[], today: Date, days: number): Array<{ key: string; date: Date; events: DeskEvent[] }> {
  const start = startOfLocalDay(today)
  const groups = Array.from({ length: days }, (_, index) => {
    const date = addDays(start, index)
    return { key: dayKey(date), date, events: [] as DeskEvent[] }
  })
  const byKey = new Map(groups.map(group => [group.key, group]))
  for (const event of events) {

    for (const key of eventDayKeys(event)) byKey.get(key)?.events.push(event)
  }
  for (const group of groups) group.events.sort((left, right) => left.start.localeCompare(right.start))
  return groups
}


interface WeekBlock {
  readonly event: DeskEvent
  readonly dayIndex: number
  readonly topPct: number
  readonly heightPct: number
  readonly lane: number
  readonly lanes: number
}


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
