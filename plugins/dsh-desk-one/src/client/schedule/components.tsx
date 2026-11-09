/**
 * Schedule page building blocks, aligned with the rest of Desk One: sub-features are in-panel
 * pages (like the notes trash or task archive), never modal overlays.
 *
 * Layout contract: the calendar page has only a compact toolbar + one-line upcoming strip + the
 * calendar itself; month and week views fill the available height without scrolling. Calendar
 * sources and event details each own a page reached from the toolbar / a calendar item.
 */

import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { SCHEDULE_UPCOMING_DAYS, type ScheduleProvider } from '../../constants.js'
import type { DeskCalendar, DeskEvent, DeskScheduleSource, ScheduleConnectionInput } from '../../contract.js'
import type { DeskTranslator } from '../app/types.js'
import type { ScheduleApi } from './api.js'
import {
  addDays, calendarColorOf, calendarNameOf, conflictIds, dayKey, formatDayTitle, formatTime, groupByDay, keyOfEvent,
  monthRange, startOfLocalDay, weekBlocks, weekdayLabel, type ScheduleViewName,
} from './utils.js'

const PROVIDER_ORDER: readonly ScheduleProvider[] = ['wecom', 'icloud', 'outlook']

function providerKey(provider: ScheduleProvider): string {
  return `schedule.provider.${provider}`
}

function eventTitle(t: DeskTranslator, event: DeskEvent): string {
  return event.title === '' ? t('schedule.untitled') : event.title
}

function dayLabel(t: DeskTranslator, date: Date, today: Date): string {
  return formatDayTitle(date, today, { today: t('schedule.day.today'), tomorrow: t('schedule.day.tomorrow') })
}

/* --------------------------------- toolbar ---------------------------------- */

interface ToolbarProps {
  readonly t: DeskTranslator
  readonly view: ScheduleViewName
  readonly cursor: Date
  readonly syncing: boolean
  readonly loading: boolean
  readonly lastSyncedAt?: string
  readonly sourceCount: number
  readonly error: string | null
  readonly onView: (view: ScheduleViewName) => void
  readonly onStep: (direction: -1 | 1) => void
  readonly onToday: () => void
  readonly onRefresh: () => void
  readonly onSources: () => void
}

export function ScheduleToolbar(props: ToolbarProps): ReactElement {
  const { t, view, cursor, syncing, error } = props
  const weekStart = addDays(startOfLocalDay(cursor), -((cursor.getDay() + 6) % 7))
  const weekEnd = addDays(weekStart, 6)
  const rangeLabel = view === 'month'
    ? cursor.toLocaleDateString([], { year: 'numeric', month: 'long' })
    : view === 'week'
      ? `${weekStart.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString([], { month: 'short', day: 'numeric' })}`
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
                time: new Date(props.lastSyncedAt).toLocaleString([], {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                }),
              })}
        </span>
        <button type="button" className="dsh-desk-schedule-chip" disabled={syncing || props.loading} onClick={props.onRefresh}>
          {syncing ? t('schedule.syncing') : t('schedule.refresh')}
        </button>
        <button type="button" className="dsh-desk-schedule-chip" onClick={props.onSources}>
          {props.sourceCount === 0 ? t('schedule.addConnection') : t('schedule.sources')}
        </button>
      </div>
      {error === null ? null : <p className="dsh-desk-schedule-error">{error}</p>}
    </div>
  )
}

/** Compact one-line upcoming strip: only the next few items, never a full column. */
export function UpcomingStrip(props: {
  readonly t: DeskTranslator
  readonly today: Date
  readonly events: readonly DeskEvent[]
  readonly calendars: readonly DeskCalendar[]
  readonly onOpen: (event: DeskEvent) => void
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
    <div className="dsh-desk-schedule-upcoming">
      <span className="dsh-desk-schedule-upcoming-label">{t('schedule.upcoming')}</span>
      {upcoming.length === 0 ? <span className="dsh-desk-schedule-upcoming-empty">{t('schedule.upcomingEmpty')}</span> : upcoming.map(({ event, day }) => (
        <button key={event.id} type="button" className="dsh-desk-schedule-upcoming-item" onClick={() => onOpen(event)}>
          <span className="dsh-desk-schedule-colorbar" style={{ background: calendarColorOf(event, calendars) }} />
          <span className="dsh-desk-schedule-upcoming-day">{dayLabel(t, day, today)}</span>
          <span className="dsh-desk-schedule-upcoming-time">{event.allDay ? t('schedule.allDay') : formatTime(event.start)}</span>
          <span className="dsh-desk-schedule-upcoming-title">{eventTitle(t, event)}</span>
        </button>
      ))}
      <button type="button" className="dsh-desk-schedule-link" onClick={props.onViewAll}>{t('schedule.viewAll')}</button>
    </div>
  )
}

/* ----------------------------------- list ------------------------------------ */

interface ListProps {
  readonly t: DeskTranslator
  readonly today: Date
  readonly events: readonly DeskEvent[]
  readonly calendars: readonly DeskCalendar[]
  readonly days: number
  readonly onOpen: (event: DeskEvent) => void
  readonly onLoadMore: () => void
}

export function ListBoard(props: ListProps): ReactElement {
  const { t, today, events, calendars, onOpen, days } = props
  const groups = useMemo(() => groupByDay(events, today, days), [days, events, today])
  const conflicts = useMemo(() => conflictIds(events), [events])
  const visibleGroups = groups.filter(group => group.events.length > 0 || group.key === dayKey(today))
  return (
    <div className="dsh-desk-schedule-list">
      {visibleGroups.every(group => group.events.length === 0) ? <p className="dsh-desk-schedule-hint">{t('schedule.listEmpty')}</p> : null}
      {visibleGroups.map(group => (
        <section key={group.key} className="dsh-desk-schedule-list-day">
          <h4>{dayLabel(t, group.date, today)}</h4>
          {group.events.length === 0 ? <p className="dsh-desk-schedule-hint">{t('schedule.dayEmpty')}</p> : group.events.map(event => (
            <button key={event.id} type="button" className="dsh-desk-schedule-row" onClick={() => onOpen(event)}>
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

/* ----------------------------------- month ----------------------------------- */

interface MonthProps {
  readonly t: DeskTranslator
  readonly cursor: Date
  readonly today: Date
  readonly events: readonly DeskEvent[]
  readonly calendars: readonly DeskCalendar[]
  readonly onOpen: (event: DeskEvent) => void
}

export function MonthBoard(props: MonthProps): ReactElement {
  const { t, cursor, today, events, calendars, onOpen } = props
  const { from, to } = useMemo(() => monthRange(cursor), [cursor])
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
  return (
    <div className="dsh-desk-schedule-month">
      <div className="dsh-desk-schedule-month-head">
        {[0, 1, 2, 3, 4, 5, 6].map(offset => (
          <span key={offset}>{weekdayLabel(addDays(from, offset))}</span>
        ))}
      </div>
      <div className="dsh-desk-schedule-month-body" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.map(row => (
          <div key={row[0]?.toISOString()} className="dsh-desk-schedule-month-row">
            {row.map(date => {
              const dayEvents = byDay.get(dayKey(date)) ?? []
              const isToday = date.toDateString() === today.toDateString()
              return (
                <div key={date.toISOString()} className="dsh-desk-schedule-month-cell" data-today={isToday} data-outside={date.getMonth() !== cursor.getMonth()}>
                  <span className="dsh-desk-schedule-month-day">{date.getDate()}</span>
                  <div className="dsh-desk-schedule-month-events">
                    {dayEvents.slice(0, 2).map(event => (
                      <button key={event.id} type="button" className="dsh-desk-schedule-month-chip" onClick={() => onOpen(event)} title={eventTitle(t, event)}>
                        <span className="dsh-desk-schedule-colorbar" style={{ background: calendarColorOf(event, calendars) }} />
                        {event.allDay ? null : <span className="dsh-desk-schedule-month-time">{formatTime(event.start)}</span>}
                        <span>{eventTitle(t, event)}</span>
                      </button>
                    ))}
                    {dayEvents.length > 2 ? <span className="dsh-desk-schedule-more-count">+{dayEvents.length - 2}</span> : null}
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
  readonly onOpen: (event: DeskEvent) => void
}

export function WeekBoard(props: WeekProps): ReactElement {
  const { t, from, today, events, calendars, onOpen } = props
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(from, index)), [from])
  const blocks = useMemo(() => weekBlocks(events, from), [events, from])
  const allDay = useMemo(() => days.map(day => events.filter(event =>
    event.allDay && keyOfEvent(event) === dayKey(day))), [days, events])
  return (
    <div className="dsh-desk-schedule-week">
      <div className="dsh-desk-schedule-week-head">
        {days.map(day => (
          <span key={day.toISOString()} className="dsh-desk-schedule-week-day" data-today={day.toDateString() === today.toDateString()}>
            <span>{weekdayLabel(day)}</span>
            <strong>{day.getDate()}</strong>
          </span>
        ))}
      </div>
      <div className="dsh-desk-schedule-week-allday">
        {days.map((day, index) => (
          <span key={day.toISOString()} className="dsh-desk-schedule-week-allday-cell">
            {allDay[index]?.map(event => (
              <button key={event.id} type="button" className="dsh-desk-schedule-week-allday-chip" onClick={() => onOpen(event)}>
                <span className="dsh-desk-schedule-colorbar" style={{ background: calendarColorOf(event, calendars) }} />
                {eventTitle(t, event)}
              </button>
            ))}
          </span>
        ))}
      </div>
      <div className="dsh-desk-schedule-week-body">
        {days.map((day, index) => (
          <div key={day.toISOString()} className="dsh-desk-schedule-week-col">
            {Array.from({ length: 24 }, (_, hour) => (
              <div key={hour} className="dsh-desk-schedule-week-hour" style={{ top: `${(hour / 24) * 100}%` }} />
            ))}
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
                onClick={() => onOpen(block.event)}
              >
                <strong>{formatTime(block.event.start)}</strong>
                <span>{eventTitle(t, block.event)}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
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
        {PROVIDER_ORDER.map(provider => (
          <div key={provider}>
            <ConnectionCard
              t={t}
              api={props.api}
              provider={provider}
              {...(sources.find(source => source.provider === provider) === undefined
                ? {}
                : { source: sources.find(source => source.provider === provider) })}
              onChanged={props.onChanged}
            />
            {sources.filter(source => source.provider === provider).map(source => (
              <div key={source.id} className="dsh-desk-schedule-source">
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
            ))}
          </div>
        ))}
        {sources.length === 0 ? <p className="dsh-desk-schedule-hint">{t('schedule.sourcesEmpty')}</p> : null}
      </div>
    </div>
  )
}

/* -------------------------------- detail card -------------------------------- */

export function EventCard(props: {
  readonly t: DeskTranslator
  readonly event: DeskEvent
  readonly calendars: readonly DeskCalendar[]
  readonly onClose: () => void
}): ReactElement {
  const { t, event, calendars } = props
  const [copied, setCopied] = useState(false)
  const when = event.allDay
    ? `${new Date(event.start).toLocaleDateString()} · ${t('schedule.allDay')}`
    : `${new Date(event.start).toLocaleDateString([], { month: 'short', day: 'numeric', weekday: 'short' })} ${formatTime(event.start)} – ${formatTime(event.end)}`
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
    <aside className="dsh-desk-schedule-detail-card" aria-label={eventTitle(t, event)}>
      <header>
        <span className="dsh-desk-schedule-colorbar" style={{ background: calendarColorOf(event, calendars) }} />
        <h3>{eventTitle(t, event)}</h3>
        <button type="button" className="dsh-desk-schedule-icon" aria-label={t('schedule.detail.close')} onClick={props.onClose}>×</button>
      </header>
      <dl>
        <dt>{t('schedule.detail.when')}</dt><dd>{when}</dd>
        <dt>{t('schedule.detail.calendar')}</dt><dd>{calendarNameOf(event, calendars)}</dd>
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
