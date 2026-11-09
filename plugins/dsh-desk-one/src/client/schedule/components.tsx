/**
 * Schedule page building blocks. Management (connections + calendars) is an in-panel page like the
 * notes trash; a single event opens a floating card anchored to the click, and month/week fill the
 * remaining height (week shows 12 hours per screen with internal scrolling).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement, WheelEvent as ReactWheelEvent } from 'react'
import { SCHEDULE_UPCOMING_DAYS, type ScheduleProvider } from '../../constants.js'
import type { DeskCalendar, DeskEvent, DeskScheduleSource, ScheduleConnectionInput } from '../../contract.js'
import type { DeskTranslator } from '../app/types.js'
import type { ScheduleApi } from './api.js'
import {
  addDays, calendarColorOf, calendarNameOf, conflictIds, dayKey, formatDateLabel, formatDayTitle, formatMonthLabel,
  formatTime, groupByDay, keyOfEvent, monthRange, startOfLocalDay, weekdayLabel, weekdayLabels, weekBlocks,
  type ScheduleViewName,
} from './utils.js'

const PROVIDER_ORDER: readonly ScheduleProvider[] = ['wecom', 'icloud', 'outlook']
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
  readonly syncing: boolean
  readonly loading: boolean
  readonly lastSyncedAt?: string
  readonly error: string | null
  readonly onView: (view: ScheduleViewName) => void
  readonly onStep: (direction: -1 | 1) => void
  readonly onToday: () => void
  readonly onRefresh: () => void
}

export function ScheduleToolbar(props: ToolbarProps): ReactElement {
  const { t, view, cursor, syncing, error } = props
  const weekStart = addDays(startOfLocalDay(cursor), -cursor.getDay())
  const weekEnd = addDays(weekStart, 6)
  const rangeLabel = view === 'month'
    ? formatMonthLabel(cursor, t)
    : view === 'week'
      ? `${formatDateLabel(weekStart, t)} – ${formatDateLabel(weekEnd, t)}`
      : t('schedule.view.list')
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
        <button type="button" className="dsh-desk-schedule-chip" disabled={syncing || props.loading} onClick={props.onRefresh}>
          {syncing ? t('schedule.syncing') : t('schedule.refresh')}
        </button>
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

/* ------------------------- calendar quick picker ----------------------------- */

/** Top-right card: source tree (collapsible) with a source-level master toggle; the full manager
 *  is still a page. Laid out like a small task list: source row first, calendars indent below. */
export function CalendarPicker(props: {
  readonly t: DeskTranslator
  readonly sources: readonly DeskScheduleSource[]
  readonly calendars: readonly DeskCalendar[]
  readonly counts: Readonly<Record<string, number>>
  readonly hidden: Set<string>
  readonly onToggle: (calendar: DeskCalendar) => void
  readonly onColor: (calendar: DeskCalendar) => Promise<void>
  readonly onSetSourceVisible: (source: DeskScheduleSource, visible: boolean) => void
  readonly onManage: () => void
}): ReactElement {
  const { t, sources, calendars, counts, hidden, onToggle, onColor } = props
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggleOpen = (id: string): void => {
    setOpen(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  return (
    <section className="dsh-desk-schedule-picker">
      <header>
        <span>{t('schedule.calendars')}</span>
        <button type="button" className="dsh-desk-schedule-link" onClick={props.onManage}>{t('schedule.manage')}</button>
      </header>
      <div className="dsh-desk-schedule-picker-list">
        {sources.length === 0 ? <p className="dsh-desk-schedule-hint">{t('schedule.sourcesEmpty')}</p> : sources.map(source => {
          const own = calendars.filter(calendar => calendar.sourceId === source.id)
          const visible = own.filter(calendar => !hidden.has(calendar.id)).length
          const expanded = open.has(source.id)
          return (
            <div key={source.id} className="dsh-desk-schedule-picker-source">
              <div className="dsh-desk-schedule-picker-source-row">
                <button
                  type="button"
                  className="dsh-desk-schedule-picker-chevron"
                  aria-expanded={expanded}
                  aria-label={expanded ? t('schedule.collapse') : t('schedule.expand')}
                  onClick={() => toggleOpen(source.id)}
                >{expanded ? '▾' : '▸'}</button>
                <span className={`dsh-desk-schedule-provider is-${source.provider}`} />
                <button type="button" className="dsh-desk-schedule-picker-source-name" onClick={() => toggleOpen(source.id)}>
                  {t(providerKey(source.provider) as never)}
                </button>
                <span className="dsh-desk-schedule-picker-count">{visible}/{own.length}</span>
                <button
                  type="button"
                  className="dsh-desk-schedule-picker-check"
                  data-visible={visible > 0}
                  aria-label={stateLabel(t, visible)}
                  onClick={() => props.onSetSourceVisible(source, visible === 0)}
                >✓</button>
              </div>
              {expanded ? (
                <div className="dsh-desk-schedule-picker-children">
                  {own.map(calendar => (
                    <button
                      key={calendar.id}
                      type="button"
                      className="dsh-desk-schedule-picker-row"
                      data-hidden={hidden.has(calendar.id)}
                      title={calendar.displayName}
                      onClick={() => onToggle(calendar)}
                    >
                      <span className="dsh-desk-schedule-picker-check" data-visible={!hidden.has(calendar.id)}>✓</span>
                      <span
                        className="dsh-desk-schedule-colorbutton"
                        style={{ background: calendar.color }}
                        onClick={event => {
                          event.stopPropagation()
                          void onColor(calendar)
                        }}
                      />
                      <span className="dsh-desk-schedule-picker-name">{calendar.displayName}</span>
                      <span className="dsh-desk-schedule-picker-count">{counts[calendar.id] ?? 0}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function stateLabel(t: DeskTranslator, visible: number): string {
  return visible === 0 ? t('schedule.sourceHidden') : t('schedule.sourceVisible')
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
        <section key={group.key} className="dsh-desk-schedule-list-day" data-weekend={isWeekend(group.date)}>
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
          <span key={label} data-weekend={index === 0 || index === 6}>{label}</span>
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
  // Show 12 hours per screen (inner height = 200% of the viewport); center the initial scroll on
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
  readonly onBack: () => void
  readonly onChanged: () => Promise<void>
}

function ConnectionCard(props: {
  readonly t: DeskTranslator
  readonly api: ScheduleApi
  readonly provider: ScheduleProvider
  readonly source?: DeskScheduleSource
  readonly onChanged: () => Promise<void>
}): ReactElement {
  const { t, api, provider, source, onChanged } = props
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
      await onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(null) }
  }

  const disconnect = async (): Promise<void> => {
    setBusy('save'); setError(null); setMessage(null)
    try {
      await api.removeConnection(provider)
      setMessage(t('schedule.form.removed'))
      await onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(null) }
  }

  return (
    <section className="dsh-desk-schedule-connection-card">
      <header>
        <span className={`dsh-desk-schedule-provider is-${provider}`} />
        <h3>{t(providerKey(provider) as never)}</h3>
        <span className="dsh-desk-schedule-connection-status" data-error={source?.syncState === 'error'}>
          {source === undefined ? t('schedule.form.notConnected') : t('schedule.form.connected')}
        </span>
      </header>
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
        {source === undefined ? null : (
          <button type="button" className="dsh-desk-schedule-chip" disabled={busy !== null} onClick={() => { void disconnect() }}>
            {t('schedule.form.remove')}
          </button>
        )}
      </div>
    </section>
  )
}

export function SourcesPage(props: SourcesPageProps): ReactElement {
  const { t, sources, calendars, counts, hidden, onToggle, onColor } = props
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
            <div key={provider}>
              <ConnectionCard t={t} api={props.api} provider={provider} {...(source === undefined ? {} : { source })} onChanged={props.onChanged} />
              {source === undefined ? null : (
                <div className="dsh-desk-schedule-source">
                  {calendars.filter(calendar => calendar.sourceId === source.id).map(calendar => (
                    <div key={calendar.id} className="dsh-desk-schedule-calendar" data-hidden={hidden.has(calendar.id)}>
                      <button
                        type="button"
                        className="dsh-desk-schedule-colorbutton"
                        style={{ background: calendar.color }}
                        title={t('schedule.changeColor')}
                        aria-label={t('schedule.changeColor')}
                        onClick={() => { void onColor(calendar) }}
                      />
                      <button type="button" className="dsh-desk-schedule-calendar-toggle" onClick={() => onToggle(calendar)}>
                        <span className="dsh-desk-schedule-calendar-name">{calendar.displayName}</span>
                        <span className="dsh-desk-schedule-calendar-count">{counts[calendar.id] ?? 0}</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {sources.length === 0 ? <p className="dsh-desk-schedule-hint">{t('schedule.sourcesEmpty')}</p> : null}
      </div>
    </div>
  )
}
