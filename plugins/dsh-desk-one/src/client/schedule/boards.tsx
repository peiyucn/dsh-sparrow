/** Calendar boards: list, month and week. The week board owns its 0–24 hour ruler and scroll anchor. */

import { addDays, calendarColorOf, calendarNameOf, conflictIds, dayKey, formatDateLabel, formatTime, groupByDay, isoWeekNumber, keyOfEvent, monthRange, weekBlocks, weekdayLabel, weekdayLabels } from './utils.js'
import { dayLabel, eventTitle } from './shared.js'
import { useEffect, useMemo, useRef } from 'react'
import type { ClickPoint } from './shared.js'
import type { DeskCalendar, DeskEvent } from '../../contract.js'
import type { DeskTranslator } from '../app/types.js'
import type { ReactElement, WheelEvent as ReactWheelEvent } from 'react'

/* ----------------------------------- list ------------------------------------ */

interface ListProps {
  readonly t: DeskTranslator
  readonly today: Date
  readonly from: Date
  readonly events: readonly DeskEvent[]
  readonly calendars: readonly DeskCalendar[]
  readonly days: number
  readonly onOpen: (event: DeskEvent, point?: ClickPoint) => void
  readonly onLoadMore: () => void
}

export function ListBoard(props: ListProps): ReactElement {
  const { t, today, from, events, calendars, onOpen, days } = props
  const groups = useMemo(() => groupByDay(events, from, days), [days, events, from])
  const conflicts = useMemo(() => conflictIds(events), [events])
  const visibleGroups = groups.filter(group => group.events.length > 0 || group.key === dayKey(from))
  return (
    <div className="dsh-desk-schedule-list">
      {visibleGroups.every(group => group.events.length === 0) ? <p className="dsh-desk-schedule-hint">{t('schedule.listEmpty')}</p> : null}
      {visibleGroups.map((group, index) => (
        <section key={group.key} className="dsh-desk-schedule-list-day" data-weekend={isWeekend(group.date)} data-today={group.key === dayKey(today)}>
          <h4 data-weekend={isWeekend(group.date)}>
            {index === 0 && group.key === dayKey(today) ? dayLabel(t, group.date, today) : `${weekdayLabel(group.date, weekdayLabels(t('schedule.weekdays')))} ${formatDateLabel(group.date, t)}`}
          </h4>
          {group.events.length === 0 ? <p className="dsh-desk-schedule-hint">{t('schedule.dayEmpty')}</p> : group.events.map(event => (
            <button key={event.id} type="button" className="dsh-desk-schedule-row" onClick={click => onOpen(event, { x: click.clientX, y: click.clientY })}>
              <span className="dsh-desk-schedule-row-time">{event.allDay ? t('schedule.allDay') : formatTime(event.start)}</span>
              <span className="dsh-desk-schedule-colorbar" style={{ background: calendarColorOf(event, calendars) }} />
              <span className="dsh-desk-schedule-row-title">{eventTitle(t, event)}</span>
              {conflicts.has(event.id) ? <span className="dsh-desk-schedule-conflict" title={t('schedule.conflict')}>!</span> : null}
              <span className="dsh-desk-schedule-row-cal">{calendarNameOf(event, calendars)}</span>
            </button>
          ))}
        </section>
      ))}
      <button type="button" className="dsh-desk-schedule-more" onClick={props.onLoadMore}>{t('schedule.loadMore')}</button>
    </div>
  )
}

function isWeekend(date: Date): boolean {
  return date.getDay() === 0 || date.getDay() === 6
}

/* ----------------------------------- month ----------------------------------- */

interface MonthProps {
  readonly t: DeskTranslator
  readonly cursor: Date
  readonly today: Date
  readonly events: readonly DeskEvent[]
  readonly calendars: readonly DeskCalendar[]
  readonly onOpen: (event: DeskEvent, point?: ClickPoint) => void
  readonly onOpenDay: (date: Date) => void
  readonly onStep: (direction: -1 | 1) => void
}

export function MonthBoard(props: MonthProps): ReactElement {
  const { t, cursor, today, events, calendars, onOpen, onOpenDay } = props
  const wheelAt = useRef(0)
  const { from, to } = useMemo(() => monthRange(cursor), [cursor])
  const labels = weekdayLabels(t('schedule.weekdays'))
  const weeks = useMemo(() => {
    const cells: Date[] = []
    for (let date = from; date < to; date = addDays(date, 1)) cells.push(date)
    const rows: Date[][] = []
    for (let index = 0; index < cells.length; index += 7) rows.push(cells.slice(index, index + 7))
    return rows
  }, [from, to])
  const byDay = useMemo(() => {
    const map = new Map<string, DeskEvent[]>()
    for (const event of events) {
      const key = keyOfEvent(event)
      const bucket = map.get(key) ?? []
      bucket.push(event)
      map.set(key, bucket)
    }
    return map
  }, [events])
  const onWheel = (event: ReactWheelEvent<HTMLDivElement>): void => {
    if (Math.abs(event.deltaY) < 12) return
    const now = Date.now()
    if (now - wheelAt.current < 380) return
    wheelAt.current = now
    props.onStep(event.deltaY > 0 ? 1 : -1)
  }
  return (
    <div className="dsh-desk-schedule-month" onWheel={onWheel} title={t('schedule.monthWheelHint')}>
      <div className="dsh-desk-schedule-month-head">
        {labels.map((label, index) => (
          <span key={label} data-weekend={index >= 5}>{label}</span>
        ))}
      </div>
      <div className="dsh-desk-schedule-month-body" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.map(row => (
          <div key={row[0]?.toISOString()} className="dsh-desk-schedule-month-row">
            {row.map(date => {
              const dayEvents = byDay.get(dayKey(date)) ?? []
              const isToday = date.toDateString() === today.toDateString()
              const hiddenCount = dayEvents.length - 2
              return (
                <div
                  key={date.toISOString()}
                  className="dsh-desk-schedule-month-cell"
                  data-today={isToday}
                  data-weekend={isWeekend(date)}
                  data-outside={date.getMonth() !== cursor.getMonth()}
                >
                  <button type="button" className="dsh-desk-schedule-month-day" onClick={() => onOpenDay(date)}>{date.getDate()}</button>
                  <div className="dsh-desk-schedule-month-events">
                    {dayEvents.slice(0, 2).map(event => (
                      <button
                        key={event.id}
                        type="button"
                        className="dsh-desk-schedule-month-chip"
                        onClick={click => onOpen(event, { x: click.clientX, y: click.clientY })}
                        title={eventTitle(t, event)}
                      >
                        <span className="dsh-desk-schedule-colorbar" style={{ background: calendarColorOf(event, calendars) }} />
                        {event.allDay ? null : <span className="dsh-desk-schedule-month-time">{formatTime(event.start)}</span>}
                        <span>{eventTitle(t, event)}</span>
                      </button>
                    ))}
                    {hiddenCount > 0 ? (
                      <button type="button" className="dsh-desk-schedule-more-count" onClick={() => onOpenDay(date)}>
                        +{hiddenCount}
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------ week ----------------------------------- */

interface WeekProps {
  readonly t: DeskTranslator
  readonly from: Date
  readonly today: Date
  readonly events: readonly DeskEvent[]
  readonly calendars: readonly DeskCalendar[]
  readonly onOpen: (event: DeskEvent, point?: ClickPoint) => void
}

export function WeekBoard(props: WeekProps): ReactElement {
  const { t, from, today, events, calendars, onOpen } = props
  const scrollRef = useRef<HTMLDivElement>(null)
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(from, index)), [from])
  const labels = weekdayLabels(t('schedule.weekdays'))
  const blocks = useMemo(() => weekBlocks(events, from), [events, from])
  const allDay = useMemo(() => days.map(day => events.filter(event =>
    event.allDay && keyOfEvent(event) === dayKey(day))), [days, events])
  const todayIndex = days.findIndex(day => day.toDateString() === today.toDateString())
  const now = new Date()
  const nowPct = ((now.getHours() * 60 + now.getMinutes()) / 1440) * 100
  // Show 8 hours per screen (inner height = 300% of the viewport); center the initial scroll on
  // the current time (or 08:00 when browsing another week).
  useEffect(() => {
    const element = scrollRef.current
    if (element === null) return
    const fraction = todayIndex >= 0 ? (now.getHours() + now.getMinutes() / 60) / 24 : 8 / 24
    const target = element.scrollHeight * fraction - element.clientHeight / 3
    element.scrollTop = Math.max(0, Math.min(target, element.scrollHeight - element.clientHeight))
    // Only re-anchor when the week changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from])
  return (
    <div className="dsh-desk-schedule-week">
      <div className="dsh-desk-schedule-week-head">
        <span
          className="dsh-desk-schedule-week-gutter dsh-desk-schedule-week-weekno"
          title={t('schedule.weekNumber', { week: isoWeekNumber(from) })}
        >{t('schedule.weekShort', { week: isoWeekNumber(from) })}</span>
        {days.map(day => (
          <span key={day.toISOString()} className="dsh-desk-schedule-week-day" data-today={day.toDateString() === today.toDateString()} data-weekend={isWeekend(day)}>
            <span>{weekdayLabel(day, labels)}</span>
            <strong>{day.getDate()}</strong>
          </span>
        ))}
      </div>
      <div className="dsh-desk-schedule-week-allday">
        <span className="dsh-desk-schedule-week-gutter" aria-hidden="true" />
        {days.map((day, index) => (
          <span key={day.toISOString()} className="dsh-desk-schedule-week-allday-cell">
            {allDay[index]?.map(event => (
              <button key={event.id} type="button" className="dsh-desk-schedule-week-allday-chip" onClick={click => onOpen(event, { x: click.clientX, y: click.clientY })}>
                <span className="dsh-desk-schedule-colorbar" style={{ background: calendarColorOf(event, calendars) }} />
                {eventTitle(t, event)}
              </button>
            ))}
          </span>
        ))}
      </div>
      <div className="dsh-desk-schedule-week-scroll" ref={scrollRef}>
        <div className="dsh-desk-schedule-week-body">
          {/* Hour ruler: 0–24 down the left edge so every grid line has a time. */}
          <div className="dsh-desk-schedule-week-hours" aria-hidden="true">
            {Array.from({ length: 25 }, (_, hour) => (
              <span
                key={hour}
                className="dsh-desk-schedule-week-hourlabel"
                data-edge={hour === 0 ? 'start' : hour === 24 ? 'end' : undefined}
                style={{ top: `${(hour / 24) * 100}%` }}
              >{hour}</span>
            ))}
          </div>
          <div className="dsh-desk-schedule-week-inner">
            {days.map((day, index) => (
              <div key={day.toISOString()} className="dsh-desk-schedule-week-col" data-weekend={isWeekend(day)}>
                {Array.from({ length: 23 }, (_, hour) => (
                  <div key={hour} className="dsh-desk-schedule-week-hour" style={{ top: `${((hour + 1) / 24) * 100}%` }} />
                ))}
                {index === todayIndex ? <div className="dsh-desk-schedule-week-now" style={{ top: `${nowPct}%` }} /> : null}
                {blocks.filter(block => block.dayIndex === index).map(block => (
                  <button
                    key={block.event.id}
                    type="button"
                    className="dsh-desk-schedule-week-block"
                    style={{
                      top: `${block.topPct}%`,
                      height: `${block.heightPct}%`,
                      left: `${(block.lane / block.lanes) * 100}%`,
                      width: `${100 / block.lanes}%`,
                      borderLeftColor: calendarColorOf(block.event, calendars),
                    }}
                    onClick={click => onOpen(block.event, { x: click.clientX, y: click.clientY })}
                  >
                    <strong>{formatTime(block.event.start)}</strong>
                    <span>{eventTitle(t, block.event)}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

