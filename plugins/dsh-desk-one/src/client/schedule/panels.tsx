/**
 * Top-row panels: "Start" create card, Today (events + clickable counts) and Upcoming (day-range
 * slider). They share the row so their internal rhythm is written together.
 */

import { addDays, calendarColorOf, dayKey, formatDateLabel, formatTime, weekdayLabel, weekdayLabels } from './utils.js'
import { dayLabel, eventTitle } from './shared.js'
import { SCHEDULE_UPCOMING_MAX_DAYS } from '../../constants.js'
import { useMemo } from 'react'
import type { ClickPoint } from './shared.js'
import type { CSSProperties, ReactElement } from 'react'
import type { DeskCalendar, DeskEvent } from '../../contract.js'
import type { DeskTranslator } from '../app/types.js'

/* ------------------------------ upcoming panel ------------------------------- */

export interface UpcomingRange {
  /** Inclusive day count starting tomorrow: 1..SCHEDULE_UPCOMING_MAX_DAYS. */
  readonly days: number
  readonly from: Date
  readonly to: Date
}

export function UpcomingPanel(props: {
  readonly t: DeskTranslator
  readonly today: Date
  readonly events: readonly DeskEvent[]
  readonly calendars: readonly DeskCalendar[]
  readonly range: UpcomingRange
  readonly onRangeChange: (days: number) => void
  readonly onOpen: (event: DeskEvent, point?: ClickPoint) => void
}): ReactElement {
  const { t, today, events, calendars, range } = props
  const visible = useMemo(() => {
    const fromDay = dayKey(range.from)
    const toDay = dayKey(addDays(range.to, -1))
    return [...events]
      .filter(event => {
        const key = dayKey(new Date(event.start))
        return key >= fromDay && key <= toDay
      })
      .sort((left, right) => left.start.localeCompare(right.start))
  }, [events, range.from, range.to])
  const shown = visible.slice(0, 3)
  // The thumb only shows the handle; tinting the track to this ratio makes the selected span visible.
  const fillPct = ((range.days - 1) / (SCHEDULE_UPCOMING_MAX_DAYS - 1)) * 100
  return (
    <section className="dsh-desk-schedule-upcoming">
      <header>
        <span>{t('schedule.upcoming')}</span>
        <span className="dsh-desk-upcoming-range-label">
          {formatDateLabel(range.from, t)} – {formatDateLabel(addDays(range.to, -1), t)}
        </span>
      </header>
      <div className="dsh-desk-upcoming-range">
        <input
          type="range"
          min="1"
          max={SCHEDULE_UPCOMING_MAX_DAYS}
          step="1"
          value={range.days}
          aria-label={t('schedule.upcomingRange')}
          style={{ '--dsh-desk-range-fill': `${fillPct}%` } as CSSProperties}
          onChange={event => props.onRangeChange(Number(event.target.value))}
        />
      </div>
      {shown.length === 0 ? <p className="dsh-desk-schedule-hint">{t('schedule.upcomingEmpty')}</p> : (
        <ul>
          {shown.map(event => (
            <li key={event.id}>
              <button type="button" className="dsh-desk-schedule-upcoming-item" onClick={click => props.onOpen(event, { x: click.clientX, y: click.clientY })}>
                <span className="dsh-desk-schedule-colorbar" style={{ background: calendarColorOf(event, calendars) }} />
                <span className="dsh-desk-schedule-upcoming-day">{dayLabel(t, new Date(event.start), today)}</span>
                <span className="dsh-desk-schedule-upcoming-time">{event.allDay ? t('schedule.allDay') : formatTime(event.start)}</span>
                <span className="dsh-desk-schedule-upcoming-title">{eventTitle(t, event)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* --------------------------------- today panel -------------------------------- */

export interface TodayContext {
  readonly notesCount: number
  readonly openTasks: number
  readonly activeSessions: number
  readonly onAddNote: () => void
  readonly onAddTask: () => void
  readonly onOpenNotes: () => void
  readonly onOpenTasks: () => void
  readonly onOpenSessions: () => void
}

/** Same plus glyph as the shared header actions, so Today's create buttons match their language. */
const plusIcon = (
  <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
    <path d="M10 4.5v11M4.5 10h11" />
  </svg>
)

export function TodayPanel(props: {
  readonly t: DeskTranslator
  readonly today: Date
  readonly events: readonly DeskEvent[]
  readonly calendars: readonly DeskCalendar[]
  readonly context: TodayContext
  readonly onOpenEvent: (event: DeskEvent, point?: ClickPoint) => void
  /** Jumps to the full calendar list for today: the "N events" shortcut. */
  readonly onOpenSchedule: () => void
}): ReactElement {
  const { t, today, events, calendars, context } = props
  const counts: readonly { readonly value: number; readonly label: string; readonly color: string; readonly onClick: () => void }[] = [
    { value: events.length, label: t('today.schedule'), color: '#7c5cd6', onClick: props.onOpenSchedule },
    { value: context.notesCount, label: t('today.notes'), color: '#d9a441', onClick: context.onOpenNotes },
    { value: context.openTasks, label: t('today.tasks'), color: '#4176e6', onClick: context.onOpenTasks },
    { value: context.activeSessions, label: t('today.sessions'), color: '#2e9e5b', onClick: context.onOpenSessions },
  ]
  return (
    <section className="dsh-desk-schedule-today">
      <div className="dsh-desk-schedule-today-head">
        <h3>{t('today.title')}</h3>
        <span>{formatDateLabel(today, t)} {weekdayLabel(today, weekdayLabels(t('schedule.weekdays')))}</span>
      </div>
      <div className="dsh-desk-today-split">
        <div className="dsh-desk-today-events">
          {events.length === 0
            ? <p className="dsh-desk-schedule-hint">{t('today.noEvents')}</p>
            : (
                <ul>
                  {[...events].sort((left, right) => left.start.localeCompare(right.start)).slice(0, 4).map(event => (
                    <li key={event.id}>
                      <button type="button" className="dsh-desk-today-event" onClick={click => props.onOpenEvent(event, { x: click.clientX, y: click.clientY })}>
                        <span className="dsh-desk-schedule-colorbar" style={{ background: calendarColorOf(event, calendars) }} />
                        <span>{event.allDay ? t('schedule.allDay') : formatTime(event.start)}</span>
                        <span className="dsh-desk-today-event-title">{eventTitle(t, event)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
        </div>
        <div className="dsh-desk-today-stats">
          {counts.map(item => (
            <button key={item.label} type="button" className="dsh-desk-today-stat" onClick={item.onClick}>
              <b style={{ color: item.color }}>{item.value}</b> {item.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

/**
 * Narrow "Start" card holding the three create actions. They stack vertically and stretch, so the
 * row can stay short while each button is taller than a plain toolbar button.
 */
export function StartPanel(props: {
  readonly t: DeskTranslator
  readonly context: TodayContext
}): ReactElement {
  const { t, context } = props
  return (
    <section className="dsh-desk-schedule-start">
      <header><h3>{t('today.start')}</h3></header>
      <div className="dsh-desk-start-actions">
        <button type="button" className="dsh-desk-action dsh-desk-action-primary" onClick={context.onAddNote}>
          {plusIcon}<span className="dsh-desk-action-label">{t('action.newNote')}</span>
        </button>
        <button type="button" className="dsh-desk-action dsh-desk-action-primary" onClick={context.onAddTask}>
          {plusIcon}<span className="dsh-desk-action-label">{t('task.add')}</span>
        </button>
        <button type="button" className="dsh-desk-action dsh-desk-action-primary" disabled title={t('tabs.moreEmpty')}>
          {plusIcon}<span className="dsh-desk-action-label">{t('tab.notebook')}</span>
        </button>
      </div>
    </section>
  )
}

