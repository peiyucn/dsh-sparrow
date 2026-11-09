/**
 * Schedule page building blocks. Management (connections + calendars) is an in-panel page like the
 * notes trash; a single event opens a floating card anchored to the click, and month/week fill the
 * remaining height (week shows 8 hours per screen with internal scrolling).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement, WheelEvent as ReactWheelEvent } from 'react'
import { SCHEDULE_UPCOMING_DAYS, type ScheduleProvider } from '../../constants.js'
import type { DeskCalendar, DeskEvent, DeskScheduleSource, ScheduleConnectionInput } from '../../contract.js'
import type { DeskTranslator } from '../app/types.js'
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
        <button type="button" className="dsh-desk-schedule-icon" aria-label={t('schedule.prev')} title={t('schedule.prev')} onClick={() => props.onStep(-1)}>‹</button>
        <span className="dsh-desk-schedule-range">{rangeLabel}</span>
        <button type="button" className="dsh-desk-schedule-icon" aria-label={t('schedule.next')} title={t('schedule.next')} onClick={() => props.onStep(1)}>›</button>
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

export function UpcomingPanel(props: {
  readonly t: DeskTranslator
  readonly today: Date
  readonly events: readonly DeskEvent[]
  readonly calendars: readonly DeskCalendar[]
  readonly onOpen: (event: DeskEvent, point?: ClickPoint) => void
  readonly onViewAll: () => void
}): ReactElement {
  const { t, today, events, calendars, onOpen } = props
  const upcoming = useMemo(() => {
    const result: { event: DeskEvent; day: Date }[] = []
    for (const group of groupByDay(events, today, SCHEDULE_UPCOMING_DAYS)) {
      for (const event of group.events) result.push({ event, day: group.date })
    }
    return result.sort((left, right) => left.event.start.localeCompare(right.event.start)).slice(0, 3)
  }, [events, today])
  return (
    <section className="dsh-desk-schedule-upcoming">
      <header>
        <span>{t('schedule.upcoming')}</span>
        <button type="button" className="dsh-desk-schedule-link" onClick={props.onViewAll}>{t('schedule.viewAll')}</button>
      </header>
      {upcoming.length === 0 ? <p className="dsh-desk-schedule-hint">{t('schedule.upcomingEmpty')}</p> : (
        <ul>
          {upcoming.map(({ event, day }) => (
            <li key={event.id}>
              <button type="button" className="dsh-desk-schedule-upcoming-item" onClick={click => onOpen(event, { x: click.clientX, y: click.clientY })}>
                <span className="dsh-desk-schedule-colorbar" style={{ background: calendarColorOf(event, calendars) }} />
                <span className="dsh-desk-schedule-upcoming-day">{dayLabel(t, day, today)}</span>
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

/** Reserved top-right slot for future cross-feature linkage (notes / tasks). */
export function LinkagePanel(props: { readonly t: DeskTranslator }): ReactElement {
  return (
    <aside className="dsh-desk-schedule-linkage">
      <header>{props.t('schedule.linkage')}</header>
      <p>{props.t('schedule.linkageHint')}</p>
      <div className="dsh-desk-schedule-linkage-chips">
        <span>{props.t('tab.notes')}</span>
        <span>{props.t('tab.tasks')}</span>
      </div>
    </aside>
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
  readonly onBack: () => void
  readonly onChanged: () => Promise<void>
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
  const [flow, setFlow] = useState<{ flowId: string; userCode: string; verificationUri: string } | null>(null)
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

  const login = async (): Promise<void> => {
    setBusy(true); setError(null)
    try {
      const start = await api.startOutlookLogin()
      setFlow({ flowId: start.flowId, userCode: start.userCode, verificationUri: start.verificationUri })
    } catch (reason) {
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
        <span className="dsh-desk-schedule-statusdot" data-on={source !== undefined} />
        <h3>{t('schedule.provider.outlook')}</h3>
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
              <button type="button" className="dsh-desk-btn dsh-desk-btn-primary" disabled={busy} onClick={() => { void login() }}>
                {busy ? t('schedule.form.saving') : t('schedule.graphLogin')}
              </button>
            </div>
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
  const [icsUrl, setIcsUrl] = useState('')
  const [busy, setBusy] = useState<'test' | 'save' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const input = (): ScheduleConnectionInput => provider === 'outlook'
    ? { provider, url: icsUrl }
    : { provider, account, password }

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
        <span className="dsh-desk-schedule-statusdot" data-on={connected} />
        <h3>{t(providerKey(provider) as never)}</h3>
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
        </div>
      ) : null}

      {editing ? (
        <div className="dsh-desk-schedule-connection-form">
          <div className="dsh-desk-schedule-form-fields">
            {provider === 'outlook' ? (
              <label>
                <span>{t('schedule.form.ics')}</span>
                <input value={icsUrl} onChange={event => setIcsUrl(event.target.value)} placeholder="https://…/calendar.ics" spellCheck={false} />
              </label>
            ) : (
              <>
                <label>
                  <span>{t('schedule.form.account')}</span>
                  <input value={account} onChange={event => setAccount(event.target.value)} spellCheck={false} autoComplete="username" />
                </label>
                <label>
                  <span>{t('schedule.form.password')}</span>
                  <input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" />
                </label>
              </>
            )}
          </div>
          <p className="dsh-desk-schedule-form-note">{t(`schedule.form.note.${provider}` as never)}</p>
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
        <span className="dsh-desk-schedule-statusdot" data-on={sources.length > 0} />
        <h3>{t('schedule.subscriptions')}</h3>
        <span className="dsh-desk-schedule-connection-status">{t('schedule.subscriptionHint')}</span>
      </header>
      {sources.length === 0 ? <p className="dsh-desk-schedule-form-note">{t('schedule.subscriptionEmpty')}</p> : null}
      {sources.map(source => {
        const own = calendars.filter(calendar => calendar.sourceId === source.id)
        return (
          <div key={source.id} className="dsh-desk-schedule-subscription">
            <div className="dsh-desk-schedule-subscription-head">
              <span className="dsh-desk-schedule-statusdot" data-on={source.syncState !== 'error'} />
              <span className="dsh-desk-schedule-mgmt-name">{source.account ?? t('schedule.subscriptions')}</span>
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
  return (
    <div className="dsh-desk-schedule-page">
      <header className="dsh-desk-schedule-pagehead">
        <button type="button" className="dsh-desk-schedule-chip" onClick={props.onBack}>{t('schedule.back')}</button>
        <h2>{t('schedule.sources')}</h2>
      </header>
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