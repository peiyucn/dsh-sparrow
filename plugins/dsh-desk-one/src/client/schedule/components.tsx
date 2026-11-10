/**
 * Schedule page building blocks. Management (connections + calendars) is an in-panel page like the
 * notes trash; a single event opens a floating card anchored to the click, and month/week fill the
 * remaining height (week shows 8 hours per screen with internal scrolling).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactElement, WheelEvent as ReactWheelEvent } from 'react'
import { SCHEDULE_UPCOMING_MAX_DAYS, type ScheduleProvider } from '../../constants.js'
import type { DeskCalendar, DeskEvent, DeskScheduleSource, ScheduleConnectionInput } from '../../contract.js'
import type { DeskTranslator } from '../app/types.js'
import { SubPageHeader } from '../app/SubPageHeader.js'
import type { ScheduleApi } from './api.js'
import {
  addDays, calendarColorOf, calendarNameOf, conflictIds, dayKey, formatDateLabel, formatDayTitle, formatFullDateLabel, formatMonthLabel,
  formatTime, groupByDay, keyOfEvent, monthRange, startOfLocalDay, weekdayLabel, weekdayLabels, weekBlocks,
  type ScheduleViewName,
} from './utils.js'

const PROVIDER_ORDER: readonly ScheduleProvider[] = ['wecom', 'icloud']
/** Card width / approximate height used to flip the detail card around the click point. */
const DETAIL_CARD_WIDTH = 360
const DETAIL_CARD_HEIGHT = 300

function providerKey(provider: ScheduleProvider): string {
  return `schedule.provider.${provider}`
}

function eventTitle(t: DeskTranslator, event: DeskEvent): string {
  return event.title === '' ? t('schedule.untitled') : event.title
}

function dayLabel(t: DeskTranslator, date: Date, today: Date): string {
  return formatDayTitle(date, today, { today: t('schedule.day.today'), tomorrow: t('schedule.day.tomorrow') },
    value => `${weekdayLabel(value, weekdayLabels(t('schedule.weekdays'))) } ${formatDateLabel(value, t)}`)
}

export interface ClickPoint {
  readonly x: number
  readonly y: number
}

/* --------------------------------- toolbar ---------------------------------- */

interface ToolbarProps {
  readonly t: DeskTranslator
  readonly view: ScheduleViewName
  readonly cursor: Date
  readonly lastSyncedAt?: string
  readonly error: string | null
  readonly onView: (view: ScheduleViewName) => void
  readonly onStep: (direction: -1 | 1) => void
  readonly onToday: () => void
}

export function ScheduleToolbar(props: ToolbarProps): ReactElement {
  const { t, view, cursor, error } = props
  const weekStart = addDays(startOfLocalDay(cursor), -((cursor.getDay() + 6) % 7))
  const weekEnd = addDays(weekStart, 6)
  const rangeLabel = view === 'month'
    ? formatMonthLabel(cursor, t)
    : view === 'week'
      ? `${formatDateLabel(weekStart, t)} – ${formatDateLabel(weekEnd, t)}`
      : formatFullDateLabel(cursor, t)
  return (
    <div className="dsh-desk-schedule-toolbar">
      <div className="dsh-desk-schedule-nav">
        <button type="button" className="dsh-desk-schedule-icon" aria-label={t('schedule.prev')} title={t('schedule.prev')} onClick={() => props.onStep(-1)}>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <span className="dsh-desk-schedule-range">{rangeLabel}</span>
        <button type="button" className="dsh-desk-schedule-icon" aria-label={t('schedule.next')} title={t('schedule.next')} onClick={() => props.onStep(1)}>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M9 18l6-6-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button type="button" className="dsh-desk-schedule-chip" onClick={props.onToday}>{t('schedule.today')}</button>
      </div>
      <div className="dsh-desk-schedule-viewtabs" role="tablist">
        {(['month', 'week', 'list'] as const).map(name => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={view === name}
            className="dsh-desk-schedule-viewtab"
            data-active={view === name}
            onClick={() => props.onView(name)}
          >{t(`schedule.view.${name}` as never)}</button>
        ))}
      </div>
      <div className="dsh-desk-schedule-actions">
        <span className="dsh-desk-schedule-synced">
          {props.lastSyncedAt === undefined
            ? t('schedule.neverSynced')
            : t('schedule.lastSync', {
                time: `${formatDateLabel(new Date(props.lastSyncedAt), t)} ${formatTime(props.lastSyncedAt)}`,
              })}
        </span>
      </div>
      {error === null ? null : <p className="dsh-desk-schedule-error">{error}</p>}
    </div>
  )
}

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
  readonly onViewAll: () => void
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
        <button type="button" className="dsh-desk-schedule-link" onClick={props.onViewAll}>{t('schedule.viewAll')}</button>
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
        <span className="dsh-desk-upcoming-range-label">
          {formatDateLabel(range.from, t)} – {formatDateLabel(addDays(range.to, -1), t)}
        </span>
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
}): ReactElement {
  const { t, today, events, calendars, context } = props
  const counts: readonly { readonly value: number; readonly label: string; readonly color: string; readonly onClick: () => void }[] = [
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
      <div className="dsh-desk-today-actions">
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
        {days.map(day => (
          <span key={day.toISOString()} className="dsh-desk-schedule-week-day" data-today={day.toDateString() === today.toDateString()} data-weekend={isWeekend(day)}>
            <span>{weekdayLabel(day, labels)}</span>
            <strong>{day.getDate()}</strong>
          </span>
        ))}
      </div>
      <div className="dsh-desk-schedule-week-allday">
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
  )
}

/* -------------------------------- detail card -------------------------------- */

export function EventCard(props: {
  readonly t: DeskTranslator
  readonly event: DeskEvent
  readonly calendars: readonly DeskCalendar[]
  readonly sources: readonly DeskScheduleSource[]
  readonly point?: ClickPoint
  readonly onClose: () => void
}): ReactElement {
  const { t, event, calendars, sources, point } = props
  const cardRef = useRef<HTMLElement>(null)
  const [copied, setCopied] = useState(false)
  const source = sources.find(item => item.provider === event.provider)
  const when = event.allDay
    ? `${dayLabel(t, startOfLocalDay(new Date(event.start)), new Date())} · ${t('schedule.allDay')}`
    : `${dayLabel(t, startOfLocalDay(new Date(event.start)), new Date())} ${formatTime(event.start)} – ${formatTime(event.end)}`
  const style = useMemo(() => {
    const width = DETAIL_CARD_WIDTH
    const height = DETAIL_CARD_HEIGHT
    const x = point === undefined ? window.innerWidth - width - 24 : point.x + 14
    const y = point === undefined ? window.innerHeight - height - 24 : point.y + 14
    return {
      left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
      width: `${width}px`,
    }
  }, [point])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      if (cardRef.current !== null && !cardRef.current.contains(event.target as Node)) props.onClose()
    }
    const onKeyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape') props.onClose() }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [props])

  const copy = async (): Promise<void> => {
    const text = `${event.title}\n${when}\n${event.location ?? ''}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => { setCopied(false) }, 2000)
    } catch {
      setCopied(false)
    }
  }
  return (
    <aside ref={cardRef} className="dsh-desk-schedule-detail-card" style={style} aria-label={eventTitle(t, event)}>
      <header>
        <span className="dsh-desk-schedule-colorbar" style={{ background: calendarColorOf(event, calendars) }} />
        <h3 title={eventTitle(t, event)}>{eventTitle(t, event)}</h3>
        <button type="button" className="dsh-desk-schedule-icon" aria-label={t('schedule.detail.close')} onClick={props.onClose}>×</button>
      </header>
      <p className="dsh-desk-schedule-detail-source">
        {source === undefined ? calendarNameOf(event, calendars) : `${t(providerKey(source.provider) as never)} · ${source.account ?? ''} · ${calendarNameOf(event, calendars)}`}
      </p>
      <dl>
        <dt>{t('schedule.detail.when')}</dt><dd>{when}</dd>
        {event.location === undefined ? null : <><dt>{t('schedule.detail.location')}</dt><dd>{event.location}</dd></>}
        {event.description === undefined ? null : <><dt>{t('schedule.detail.description')}</dt><dd className="dsh-desk-schedule-detail-desc">{event.description}</dd></>}
      </dl>
      <footer>
        <span className="dsh-desk-schedule-readonly">{t('schedule.readOnly')}</span>
        <button type="button" className="dsh-desk-schedule-chip" onClick={() => { void copy() }}>{copied ? t('schedule.detail.copied') : t('schedule.detail.copy')}</button>
        {event.url === undefined ? null : (
          <a className="dsh-desk-schedule-chip" href={event.url} target="_blank" rel="noreferrer">{t('schedule.detail.open')}</a>
        )}
      </footer>
    </aside>
  )
}

/* ------------------------------- sources page -------------------------------- */

interface SourcesPageProps {
  readonly t: DeskTranslator
  readonly api: ScheduleApi
  readonly sources: readonly DeskScheduleSource[]
  readonly calendars: readonly DeskCalendar[]
  readonly counts: Readonly<Record<string, number>>
  readonly hidden: Set<string>
  readonly onToggle: (calendar: DeskCalendar) => void
  readonly onColor: (calendar: DeskCalendar) => Promise<void>
  readonly onSetEnabled: (calendar: DeskCalendar, enabled: boolean) => Promise<void>
  readonly onChanged: () => Promise<void>
  /** Manual force-sync lives here: pulling calendars is part of source management. */
  readonly onSync: () => void
  readonly syncing: boolean
  /** Sync/load failure surfaced here, because the calendar toolbar is not on this page. */
  readonly syncError: string | null
}

/**
 * One source card: status header, in-card calendar selection and a collapsible connection form.
 * A configured source keeps its form collapsed; the whole block (connection + calendars) is one
 * surface instead of two stacked boxes.
 */
/** Calendar rows shared by the personal-account cards and the Outlook Graph card. */
function CalendarRows(props: {
  readonly t: DeskTranslator
  readonly calendars: readonly DeskCalendar[]
  readonly counts: Readonly<Record<string, number>>
  readonly hidden: Set<string>
  readonly onToggle: (calendar: DeskCalendar) => void
  readonly onColor: (calendar: DeskCalendar) => Promise<void>
  readonly onSetEnabled: (calendar: DeskCalendar, enabled: boolean) => Promise<void>
}): ReactElement {
  const { t, calendars, counts, hidden, onToggle, onColor, onSetEnabled } = props
  return (
    <>
      {calendars.length === 0 ? <p className="dsh-desk-schedule-hint">{t('schedule.noCalendars')}</p> : null}
      {calendars.map(calendar => (
        <div key={calendar.id} className="dsh-desk-schedule-mgmt-row" data-off={!calendar.enabled}>
          <button
            type="button"
            className="dsh-desk-schedule-colorbutton"
            style={{ background: calendar.color }}
            title={t('schedule.changeColor')}
            aria-label={t('schedule.changeColor')}
            onClick={() => { void onColor(calendar) }}
          />
          <span className="dsh-desk-schedule-mgmt-name">{calendar.displayName}</span>
          <span className="dsh-desk-schedule-mgmt-count">{counts[calendar.id] ?? 0}</span>
          <span className="dsh-desk-schedule-mgmt-label">{t('schedule.syncLabel')}</span>
          <button
            type="button"
            className="dsh-desk-switch"
            role="switch"
            aria-checked={calendar.enabled}
            data-on={calendar.enabled}
            title={t('schedule.syncCalendar')}
            aria-label={t('schedule.syncCalendar')}
            onClick={() => { void onSetEnabled(calendar, !calendar.enabled) }}
          />
          <span className="dsh-desk-schedule-mgmt-label">{t('schedule.displayLabel')}</span>
          <button
            type="button"
            className="dsh-desk-switch"
            role="switch"
            aria-checked={!hidden.has(calendar.id)}
            data-on={!hidden.has(calendar.id)}
            aria-label={t('schedule.showCalendar')}
            onClick={() => onToggle(calendar)}
          />
        </div>
      ))}
    </>
  )
}

/** Microsoft four-square mark used on the OAuth button (official brand colours). */
function MicrosoftLogo(): ReactElement {
  return (
    <svg viewBox="0 0 23 23" width="14" height="14" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="10" height="10" fill="#f25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7fba00" />
      <rect x="1" y="12" width="10" height="10" fill="#00a4ef" />
      <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
    </svg>
  )
}

/** Provider marks: Apple / Microsoft / Tencent, kept inline so no icon dependency ships. */
function AppleLogo(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M11.932 6.908c.95 0 2.727-1.291 4.595-1.1.782.032 2.976.316 4.388 2.38-.113.069-2.622 1.528-2.593 4.565.034 3.617 3.166 4.828 3.221 4.85-.029.086-.506 1.723-1.658 3.416-1.002 1.463-2.039 2.919-3.675 2.95-1.606.03-2.125-.955-3.96-.955s-2.409.923-3.931.984c-1.581.06-2.78-1.58-3.79-3.037-2.065-2.98-3.64-8.422-1.527-12.087 1.051-1.824 2.93-2.98 4.969-3.009 1.549-.032 3.011 1.043 3.96 1.043zM16.552 0c.153 1.407-.411 2.817-1.251 3.833-.837 1.013-2.214 1.804-3.555 1.7-.185-1.378.495-2.814 1.27-3.712C13.883.805 15.346.05 16.553 0z" />
    </svg>
  )
}

function TencentLogo(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="currentColor" style={{ color: '#0052d9' }}>
      <path d="M9.976 1L24 9.8l-10.587.015L10.723 23H5.489L8.18 9.8H3.244L1 5.4h8.077L9.976 1z" />
    </svg>
  )
}

function ProviderLogo(props: { readonly provider: ScheduleProvider }): ReactElement {
  if (props.provider === 'outlook') return <MicrosoftLogo />
  if (props.provider === 'icloud') return <AppleLogo />
  return <TencentLogo />
}

/** Outlook personal account: OAuth device code, never a published ICS link. */
function OutlookGraphCard(props: {
  readonly t: DeskTranslator
  readonly api: ScheduleApi
  readonly source?: DeskScheduleSource
  readonly calendars: readonly DeskCalendar[]
  readonly counts: Readonly<Record<string, number>>
  readonly hidden: Set<string>
  readonly onToggle: (calendar: DeskCalendar) => void
  readonly onColor: (calendar: DeskCalendar) => Promise<void>
  readonly onSetEnabled: (calendar: DeskCalendar, enabled: boolean) => Promise<void>
  readonly onChanged: () => Promise<void>
}): ReactElement {
  const { t, api, source, calendars } = props
  const [flow, setFlow] = useState<{ flowId: string; kind: 'redirect' | 'device'; userCode: string; verificationUri: string } | null>(null)
  const popupRef = useRef<Window | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (flow === null) return
    let stopped = false
    const tick = async (): Promise<void> => {
      try {
        const result = await api.pollOutlookLogin(flow.flowId)
        if (stopped) return
        if (result.status === 'connected') {
          popupRef.current?.close()
          popupRef.current = null
          setFlow(null)
          await props.onChanged()
        }
      } catch (reason) {
        if (!stopped) setError(reason instanceof Error ? reason.message : String(reason))
      }
    }
    const timer = window.setInterval(() => { void tick() }, 5000)
    return () => { stopped = true; window.clearInterval(timer) }
  }, [api, flow, props])

  const login = async (device = false): Promise<void> => {
    setBusy(true); setError(null)
    const popup = device ? null : window.open('', 'desk-one-outlook', 'width=520,height=680')
    popupRef.current = popup
    try {
      // Microsoft ignores the port for localhost redirect URIs, so the DSH port can vary.
      const port = window.location.port === '' ? '' : `:${window.location.port}`
      const redirectUri = device ? undefined : `http://localhost${port}/api/desk-one/schedule/outlook/callback`
      const start = await api.startOutlookLogin(redirectUri)
      if (start.kind === 'redirect' && start.authUrl !== undefined) {
        if (popup === null || popup.closed) window.location.href = start.authUrl
        else popup.location.href = start.authUrl
        setFlow({ flowId: start.flowId, kind: 'redirect', userCode: '', verificationUri: '' })
      } else {
        popup?.close()
        setFlow({ flowId: start.flowId, kind: 'device', userCode: start.userCode, verificationUri: start.verificationUri })
      }
    } catch (reason) {
      popup?.close()
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(false) }
  }

  const disconnect = async (): Promise<void> => {
    setBusy(true); setError(null)
    try {
      await api.disconnectOutlook()
      await props.onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(false) }
  }

  return (
    <section className="dsh-desk-schedule-connection-card" data-connected={source !== undefined}>
      <header>
        <ProviderLogo provider="outlook" />
        <h3>{t('schedule.provider.outlook')}</h3>
        <span className="dsh-desk-schedule-statusdot" data-on={source !== undefined} />
        <span className="dsh-desk-schedule-connection-status">
          {source === undefined ? t('schedule.graphPending') : t('schedule.form.connected')}
        </span>
        {source === undefined ? null : (
          <button type="button" className="dsh-desk-schedule-chip" disabled={busy} onClick={() => { void disconnect() }}>
            {t('schedule.graphDisconnect')}
          </button>
        )}
      </header>
      {source === undefined ? (
        <>
          <p className="dsh-desk-schedule-form-note">{t('schedule.graphLoginHint')}</p>
          {flow === null ? (
            <div className="dsh-desk-schedule-form-actions">
              <button type="button" className="dsh-desk-btn dsh-desk-btn-primary dsh-desk-graph-login" disabled={busy} onClick={() => { void login() }}>
                <MicrosoftLogo />
                {busy ? t('schedule.form.saving') : t('schedule.graphLogin')}
              </button>
              <button type="button" className="dsh-desk-schedule-link" disabled={busy} onClick={() => { void login(true) }}>
                {t('schedule.graphDeviceLogin')}
              </button>
            </div>
          ) : flow.kind === 'redirect' ? (
            <p className="dsh-desk-schedule-form-ok">{t('schedule.graphRedirectHint')}</p>
          ) : (
            <p className="dsh-desk-schedule-form-ok">
              {t('schedule.graphCodeHint', { url: flow.verificationUri, code: flow.userCode })}
            </p>
          )}
        </>
      ) : (
        <div className="dsh-desk-schedule-source">
          <p className="dsh-desk-schedule-sync-hint">{t('schedule.syncCalendarHint')}</p>
          <CalendarRows
            t={t}
            calendars={calendars}
            counts={props.counts}
            hidden={props.hidden}
            onToggle={props.onToggle}
            onColor={props.onColor}
            onSetEnabled={props.onSetEnabled}
          />
        </div>
      )}
      {error === null ? null : <p className="dsh-desk-schedule-error">{error}</p>}
    </section>
  )
}

function ProviderCard(props: {
  readonly t: DeskTranslator
  readonly api: ScheduleApi
  readonly provider: ScheduleProvider
  readonly source?: DeskScheduleSource
  readonly calendars: readonly DeskCalendar[]
  readonly counts: Readonly<Record<string, number>>
  readonly hidden: Set<string>
  readonly onToggle: (calendar: DeskCalendar) => void
  readonly onColor: (calendar: DeskCalendar) => Promise<void>
  readonly onSetEnabled: (calendar: DeskCalendar, enabled: boolean) => Promise<void>
  readonly onChanged: () => Promise<void>
}): ReactElement {
  const { t, api, provider, source, calendars, counts, hidden, onToggle, onColor, onSetEnabled } = props
  const connected = source !== undefined
  const [editing, setEditing] = useState(!connected)
  const [account, setAccount] = useState(source?.account ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<'test' | 'save' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const input = (): ScheduleConnectionInput => ({ provider, account, password })

  const runTest = async (): Promise<void> => {
    setBusy('test'); setError(null); setMessage(null)
    try {
      const result = await api.testConnection(input())
      setMessage(result.message)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(null) }
  }

  const save = async (): Promise<void> => {
    setBusy('save'); setError(null); setMessage(null)
    try {
      await api.saveConnection(input())
      setPassword('')
      setMessage(t('schedule.form.saved'))
      setEditing(false)
      await props.onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(null) }
  }

  const disconnect = async (): Promise<void> => {
    setBusy('save'); setError(null); setMessage(null)
    try {
      await api.removeConnection(provider)
      setMessage(t('schedule.form.removed'))
      await props.onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(null) }
  }

  const enabledCount = calendars.filter(calendar => calendar.enabled).length
  return (
    <section className="dsh-desk-schedule-connection-card" data-connected={connected}>
      <header>
        <ProviderLogo provider={provider} />
        <h3>{t(providerKey(provider) as never)}</h3>
        <span className="dsh-desk-schedule-statusdot" data-on={connected} />
        <span className="dsh-desk-schedule-connection-status" data-error={source?.syncState === 'error'}>
          {connected ? t('schedule.form.connected') : t('schedule.form.notConnected')}
        </span>
        {connected ? <span className="dsh-desk-schedule-connection-count">{enabledCount}/{calendars.length}</span> : null}
        <button type="button" className="dsh-desk-schedule-chip" onClick={() => setEditing(value => !value)}>
          {editing ? t('schedule.collapse') : t('schedule.connectionSettings')}
        </button>
      </header>

      {connected && !editing ? (
        <div className="dsh-desk-schedule-source">
          <p className="dsh-desk-schedule-sync-hint">{t('schedule.syncCalendarHint')}</p>
          <CalendarRows
            t={t}
            calendars={calendars}
            counts={counts}
            hidden={hidden}
            onToggle={onToggle}
            onColor={onColor}
            onSetEnabled={onSetEnabled}
          />
        </div>
      ) : null}

      {editing ? (
        <div className="dsh-desk-schedule-connection-form">
          <div className="dsh-desk-schedule-form-fields">
            <label>
              <span>{t('schedule.form.account')}</span>
              <input value={account} onChange={event => setAccount(event.target.value)} spellCheck={false} autoComplete="username" />
            </label>
            <label>
              <span>{t('schedule.form.password')}</span>
              <input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" />
            </label>
          </div>
          <p className="dsh-desk-schedule-form-note">{t(`schedule.form.note.${provider}` as never)}</p>
          {provider === 'icloud' ? (
            <>
              <a
                className="dsh-desk-schedule-link"
                href="https://account.apple.com/account/manage"
                target="_blank"
                rel="noreferrer"
              >{t('schedule.form.applePasswordLink')}</a>
              <details className="dsh-desk-schedule-steps">
                <summary>{t('schedule.icloud.stepsTitle')}</summary>
                <ol>
                  <li>{t('schedule.icloud.step1')}</li>
                  <li>{t('schedule.icloud.step2')}</li>
                  <li>{t('schedule.icloud.step3')}</li>
                </ol>
              </details>
            </>
          ) : null}
          {message === null ? null : <p className="dsh-desk-schedule-form-ok">{message}</p>}
          {error === null ? null : <p className="dsh-desk-schedule-error">{error}</p>}
          <div className="dsh-desk-schedule-form-actions">
            <button type="button" className="dsh-desk-schedule-chip" disabled={busy !== null} onClick={() => { void runTest() }}>
              {busy === 'test' ? t('schedule.form.testing') : t('schedule.form.test')}
            </button>
            <button type="button" className="dsh-desk-btn dsh-desk-btn-primary" disabled={busy !== null} onClick={() => { void save() }}>
              {busy === 'save' ? t('schedule.form.saving') : t('schedule.form.save')}
            </button>
            {connected ? (
              <button type="button" className="dsh-desk-schedule-chip" disabled={busy !== null} onClick={() => { void disconnect() }}>
                {t('schedule.form.remove')}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}

/** Provider-agnostic ICS subscriptions: several URLs, each one its own read-only calendar. */
function SubscriptionCard(props: {
  readonly t: DeskTranslator
  readonly api: ScheduleApi
  readonly sources: readonly DeskScheduleSource[]
  readonly calendars: readonly DeskCalendar[]
  readonly counts: Readonly<Record<string, number>>
  readonly hidden: Set<string>
  readonly onToggle: (calendar: DeskCalendar) => void
  readonly onColor: (calendar: DeskCalendar) => Promise<void>
  readonly onSetEnabled: (calendar: DeskCalendar, enabled: boolean) => Promise<void>
  readonly onChanged: () => Promise<void>
}): ReactElement {
  const { t, api, sources, calendars, counts, hidden, onToggle, onColor, onSetEnabled } = props
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const add = async (): Promise<void> => {
    setBusy(true); setError(null); setMessage(null)
    try {
      await api.addSubscription({ name, url })
      setName(''); setUrl('')
      setMessage(t('schedule.form.saved'))
      await props.onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(false) }
  }

  const remove = async (sourceId: string): Promise<void> => {
    setBusy(true); setError(null); setMessage(null)
    try {
      await api.removeSubscription(sourceId)
      await props.onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(false) }
  }

  return (
    <section className="dsh-desk-schedule-connection-card">
      <header>
        <h3>{t('schedule.subscriptions')}</h3>
        <span className="dsh-desk-schedule-statusdot" data-on={sources.length > 0} />
        <span className="dsh-desk-schedule-connection-status">{t('schedule.subscriptionHint')}</span>
      </header>
      {sources.length === 0 ? <p className="dsh-desk-schedule-form-note">{t('schedule.subscriptionEmpty')}</p> : null}
      {sources.map(source => {
        const own = calendars.filter(calendar => calendar.sourceId === source.id)
        return (
          <div key={source.id} className="dsh-desk-schedule-subscription">
            <div className="dsh-desk-schedule-subscription-head">
              <span className="dsh-desk-schedule-mgmt-name">{source.account ?? t('schedule.subscriptions')}</span>
              <span className="dsh-desk-schedule-statusdot" data-on={source.syncState !== 'error'} />
              <button
                type="button"
                className="dsh-desk-schedule-link"
                disabled={busy}
                onClick={() => { void remove(source.id) }}
              >{t('schedule.removeSubscription')}</button>
            </div>
            {own.map(calendar => (
              <div key={calendar.id} className="dsh-desk-schedule-mgmt-row" data-off={!calendar.enabled}>
                <button
                  type="button"
                  className="dsh-desk-schedule-colorbutton"
                  style={{ background: calendar.color }}
                  title={t('schedule.changeColor')}
                  aria-label={t('schedule.changeColor')}
                  onClick={() => { void onColor(calendar) }}
                />
                <span className="dsh-desk-schedule-mgmt-name">{calendar.displayName}</span>
                <span className="dsh-desk-schedule-mgmt-count">{counts[calendar.id] ?? 0}</span>
                <span className="dsh-desk-schedule-mgmt-label">{t('schedule.syncLabel')}</span>
                <button
                  type="button"
                  className="dsh-desk-switch"
                  role="switch"
                  aria-checked={calendar.enabled}
                  data-on={calendar.enabled}
                  aria-label={t('schedule.syncCalendar')}
                  onClick={() => { void onSetEnabled(calendar, !calendar.enabled) }}
                />
                <span className="dsh-desk-schedule-mgmt-label">{t('schedule.displayLabel')}</span>
                <button
                  type="button"
                  className="dsh-desk-switch"
                  role="switch"
                  aria-checked={!hidden.has(calendar.id)}
                  data-on={!hidden.has(calendar.id)}
                  aria-label={t('schedule.showCalendar')}
                  onClick={() => onToggle(calendar)}
                />
              </div>
            ))}
          </div>
        )
      })}
      <div className="dsh-desk-schedule-form-fields">
        <label>
          <span>{t('schedule.subscriptionName')}</span>
          <input value={name} onChange={event => setName(event.target.value)} placeholder={t('schedule.subscriptionNameHint')} />
        </label>
        <label>
          <span>{t('schedule.subscriptionUrl')}</span>
          <input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://…/calendar.ics" spellCheck={false} />
        </label>
      </div>
      {error === null ? null : <p className="dsh-desk-schedule-error">{error}</p>}
      {message === null ? null : <p className="dsh-desk-schedule-form-ok">{message}</p>}
      <div className="dsh-desk-schedule-form-actions">
        <button type="button" className="dsh-desk-btn dsh-desk-btn-primary" disabled={busy || url.trim() === ''} onClick={() => { void add() }}>
          {busy ? t('schedule.form.saving') : t('schedule.addSubscription')}
        </button>
      </div>
    </section>
  )
}
export function SourcesPage(props: SourcesPageProps): ReactElement {
  const { t, sources, calendars, counts, hidden, onToggle, onColor, onSetEnabled } = props
  const connected = sources.length
  return (
    <div className="dsh-desk-schedule-page">
      <SubPageHeader
        title={t('schedule.sources')}
        {...(connected > 0 ? { count: t('schedule.sourceCount', { count: connected }) } : {})}
        action={(
          <button
            type="button"
            className="dsh-desk-schedule-chip"
            disabled={props.syncing}
            data-busy={props.syncing ? 'true' : undefined}
            onClick={props.onSync}
          >
            <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4.2 8.5A6 6 0 0 1 15.5 6M15.8 11.5A6 6 0 0 1 4.5 14M15.5 3.5V6h-2.5M4.5 16.5V14H7" />
            </svg>
            {props.syncing ? t('schedule.syncing') : t('schedule.refresh')}
          </button>
        )}
      />
      {props.syncError === null ? null : <p className="dsh-desk-schedule-error">{props.syncError}</p>}
      <div className="dsh-desk-schedule-sources-page">
        {PROVIDER_ORDER.map(provider => {
          const source = sources.find(item => item.provider === provider)
          return (
            <ProviderCard
              key={provider}
              t={t}
              api={props.api}
              provider={provider}
              {...(source === undefined ? {} : { source })}
              calendars={source === undefined ? [] : calendars.filter(calendar => calendar.sourceId === source.id)}
              counts={counts}
              hidden={hidden}
              onToggle={onToggle}
              onColor={onColor}
              onSetEnabled={onSetEnabled}
              onChanged={props.onChanged}
            />
          )
        })}
        {(() => {
          const graphSource = sources.find(item => item.provider === 'outlook' && item.channel === 'graph')
          return (
            <OutlookGraphCard
              t={t}
              api={props.api}
              {...(graphSource === undefined ? {} : { source: graphSource })}
              calendars={graphSource === undefined ? [] : calendars.filter(calendar => calendar.sourceId === graphSource.id)}
              counts={counts}
              hidden={hidden}
              onToggle={onToggle}
              onColor={onColor}
              onSetEnabled={onSetEnabled}
              onChanged={props.onChanged}
            />
          )
        })()}
        <SubscriptionCard
          t={t}
          api={props.api}
          sources={sources.filter(source => source.provider === 'ics')}
          calendars={calendars}
          counts={counts}
          hidden={hidden}
          onToggle={onToggle}
          onColor={onColor}
          onSetEnabled={onSetEnabled}
          onChanged={props.onChanged}
        />
      </div>
    </div>
  )
}