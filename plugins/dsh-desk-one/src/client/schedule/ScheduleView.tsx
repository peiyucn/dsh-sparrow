/**
 * Schedule page (S2, read-only aggregation).
 *
 * Information architecture follows the rest of Desk One: the tab holds in-panel pages, not modals.
 *   calendar (month / week / list) → sources (connections + calendars) → event detail
 * The calendar page keeps only a toolbar, a one-line upcoming strip and the calendar itself;
 * month and week fill the available height without scrolling.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
  SCHEDULE_COLORS, SCHEDULE_HIDDEN_STORAGE_KEY, SCHEDULE_LIST_DAYS, SCHEDULE_SYNC_INTERVAL_MS,
  SCHEDULE_VIEW_STORAGE_KEY,
} from '../../constants.js'
import type { DeskCalendar, DeskEvent, DeskScheduleSource, ScheduleStateResponse } from '../../contract.js'
import type { DeskTranslator } from '../app/types.js'
import type { ScheduleApi } from './api.js'
import { addDays, listRange, monthRange, startOfLocalDay, weekRange, type ScheduleViewName } from './utils.js'
import {
  CalendarPicker, EventCard, ListBoard, MonthBoard, ScheduleToolbar, SourcesPage, UpcomingPanel, WeekBoard,
  type ClickPoint,
} from './components.js'

type SchedulePage = 'calendar' | 'sources'

function readView(): ScheduleViewName {
  try {
    const stored = window.localStorage.getItem(SCHEDULE_VIEW_STORAGE_KEY)
    if (stored === 'month' || stored === 'week' || stored === 'list') return stored
  } catch {
    // Storage unavailable: use the default view for this session.
  }
  return 'month'
}

function readHidden(): Set<string> {
  try {
    const stored = window.localStorage.getItem(SCHEDULE_HIDDEN_STORAGE_KEY)
    if (stored !== null) return new Set(JSON.parse(stored) as string[])
  } catch {
    // Corrupt preference: treat every calendar as visible.
  }
  return new Set()
}

export function ScheduleView({ t, api }: { readonly t: DeskTranslator; readonly api: ScheduleApi }): ReactElement {
  const today = useMemo(() => startOfLocalDay(new Date()), [])
  const [page, setPage] = useState<SchedulePage>('calendar')
  const [view, setView] = useState<ScheduleViewName>(readView)
  const [cursor, setCursor] = useState<Date>(today)
  const [state, setState] = useState<ScheduleStateResponse | null>(null)
  const [events, setEvents] = useState<readonly DeskEvent[]>([])
  const [hidden, setHidden] = useState<Set<string>>(readHidden)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [selected, setSelected] = useState<{ event: DeskEvent; point?: ClickPoint } | null>(null)
  const [listStart, setListStart] = useState<Date>(today)
  const [listDays, setListDays] = useState(SCHEDULE_LIST_DAYS)
  const syncingRef = useRef(false)
  const autoSyncTried = useRef(false)
  const loadedOnce = useRef(false)

  const range = useMemo(() => {
    if (view === 'month') return monthRange(cursor)
    if (view === 'week') return weekRange(cursor)
    return listRange(listStart, listDays)
  }, [cursor, listDays, listStart, today, view])

  const load = useCallback(async (): Promise<void> => {
    const [nextState, payload] = await Promise.all([
      api.loadState(),
      api.loadEvents(range.from.toISOString(), range.to.toISOString()),
    ])
    setState(nextState)
    setEvents(payload.events)
  }, [api, range.from, range.to])

  useEffect(() => {
    let cancelled = false
    // Only the very first load blanks the page; background refreshes keep the current surface.
    if (!loadedOnce.current) setLoading(true)
    load()
      .then(() => { if (!cancelled) setError(null) })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => {
        if (cancelled) return
        loadedOnce.current = true
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [load])

  const runSync = useCallback(async (): Promise<void> => {
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    setError(null)
    try {
      await api.sync()
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }, [api, load])

  // One auto-sync per mount (stale mirror only), never a state-driven loop.
  useEffect(() => {
    if (state === null || autoSyncTried.current) return
    autoSyncTried.current = true
    const newest = state.sources
      .map(source => (source.lastSyncedAt === undefined ? 0 : Date.parse(source.lastSyncedAt)))
      .reduce((max, value) => Math.max(max, value), 0)
    if (Date.now() - newest > 5 * 60_000) void runSync()
  }, [runSync, state])

  useEffect(() => {
    const timer = window.setInterval(() => { void runSync() }, SCHEDULE_SYNC_INTERVAL_MS)
    return () => { window.clearInterval(timer) }
  }, [runSync])

  const chooseView = useCallback((next: ScheduleViewName): void => {
    setView(next)
    try {
      window.localStorage.setItem(SCHEDULE_VIEW_STORAGE_KEY, next)
    } catch {
      // Preference only.
    }
  }, [])

  const persistHidden = useCallback((next: Set<string>): void => {
    try {
      window.localStorage.setItem(SCHEDULE_HIDDEN_STORAGE_KEY, JSON.stringify([...next]))
    } catch {
      // Preference only.
    }
  }, [])

  const toggleHidden = useCallback((calendar: DeskCalendar): void => {
    setHidden(previous => {
      const next = new Set(previous)
      if (next.has(calendar.id)) next.delete(calendar.id)
      else next.add(calendar.id)
      persistHidden(next)
      return next
    })
  }, [persistHidden])

  /** Source-level master switch: show/hide every calendar of that source at once. */
  const setSourceVisible = useCallback((source: DeskScheduleSource, visible: boolean): void => {
    const own = (state?.calendars ?? []).filter(item => item.sourceId === source.id)
    setHidden(previous => {
      const next = new Set(previous)
      for (const calendar of own) {
        if (visible) next.delete(calendar.id)
        else next.add(calendar.id)
      }
      persistHidden(next)
      return next
    })
  }, [persistHidden, state])

  const cycleColor = useCallback(async (calendar: DeskCalendar): Promise<void> => {
    const index = (SCHEDULE_COLORS as readonly string[]).indexOf(calendar.color)
    const next = SCHEDULE_COLORS[(index + 1) % SCHEDULE_COLORS.length] ?? SCHEDULE_COLORS[0]
    try {
      setState(await api.updateCalendar({ id: calendar.id, expectedRevision: calendar.revision, patch: { color: next } }))
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }, [api])

  const openEvent = (event: DeskEvent, point?: ClickPoint): void => {
    setSelected(point === undefined ? { event } : { event, point })
  }

  /** Month "+N" / day number: jump to the agenda list starting at that day. */
  const openDay = (date: Date): void => {
    setListStart(startOfLocalDay(date))
    chooseView('list')
    setCursor(date)
  }

  const visibleEvents = useMemo(
    () => events.filter(event => !hidden.has(event.calendarNodeId)),
    [events, hidden],
  )
  const calendars = state?.calendars ?? []
  const sources = state?.sources ?? []
  const counts = state?.counts ?? {}
  const staleSources = sources.filter(source => source.syncState === 'error')
  const failedCalendars = calendars.filter(calendar => calendar.lastError !== undefined)
  const lastSyncedAt = useMemo(() => {
    const times = sources
      .map(source => source.lastSyncedAt)
      .filter((value): value is string => value !== undefined && Number.isFinite(Date.parse(value)))
      .sort()
    return times[times.length - 1]
  }, [sources])

  if (page === 'sources') {
    return (
      <SourcesPage
        t={t}
        api={api}
        sources={sources}
        calendars={calendars}
        counts={counts}
        hidden={hidden}
        onToggle={toggleHidden}
        onColor={cycleColor}
        onBack={() => { setPage('calendar') }}
        onChanged={async () => { await load() }}
      />
    )
  }

  const step = (direction: -1 | 1): void => {
    if (view === 'month') setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1))
    else if (view === 'week') setCursor(addDays(cursor, direction * 7))
    else setCursor(addDays(cursor, direction * SCHEDULE_LIST_DAYS))
  }

  const toolbarError = staleSources[0]?.lastError?.message
    ?? (failedCalendars.length === 0 ? null : t('schedule.calendarSyncFailed', {
      count: failedCalendars.length,
      message: failedCalendars[0]?.lastError?.message ?? '',
    }))
    ?? error

  return (
    <div className="dsh-desk-schedule">
      <ScheduleToolbar
        t={t}
        view={view}
        cursor={cursor}
        syncing={syncing}
        loading={loading}
        {...(lastSyncedAt === undefined ? {} : { lastSyncedAt })}
        error={toolbarError}
        onView={chooseView}
        onStep={step}
        onToday={() => { setCursor(today) }}
        onRefresh={() => { void runSync() }}
      />
      {state === null ? (
        <p className="dsh-desk-schedule-hint">{loading ? t('state.loading') : t('schedule.sourcesEmpty')}</p>
      ) : sources.length === 0 ? (
        <div className="dsh-desk-schedule-empty">
          <p>{t('schedule.sourcesEmpty')}</p>
          <button type="button" className="dsh-desk-btn dsh-desk-btn-primary" onClick={() => { setPage('sources') }}>
            {t('schedule.addConnection')}
          </button>
        </div>
      ) : (
        <>
          <div className="dsh-desk-schedule-top">
            <UpcomingPanel
              t={t}
              today={today}
              events={visibleEvents}
              calendars={calendars}
              onOpen={openEvent}
              onViewAll={() => { setListStart(today); chooseView('list'); setCursor(today) }}
            />
            <CalendarPicker
              t={t}
              sources={sources}
              calendars={calendars}
              counts={counts}
              hidden={hidden}
              onToggle={toggleHidden}
              onColor={cycleColor}
              onSetSourceVisible={setSourceVisible}
              onManage={() => { setSelected(null); setPage('sources') }}
            />
          </div>
          <section className="dsh-desk-schedule-main">
            {view === 'month' ? (
              <MonthBoard
                t={t}
                cursor={cursor}
                today={today}
                events={visibleEvents}
                calendars={calendars}
                onOpen={openEvent}
                onOpenDay={openDay}
                onStep={step}
              />
            ) : view === 'week' ? (
              <WeekBoard t={t} from={range.from} today={today} events={visibleEvents} calendars={calendars} onOpen={openEvent} />
            ) : (
              <ListBoard
                t={t}
                today={today}
                from={listStart}
                events={visibleEvents}
                calendars={calendars}
                days={listDays}
                onOpen={openEvent}
                onLoadMore={() => { setListDays(days => days + SCHEDULE_LIST_DAYS) }}
              />
            )}
          </section>
        </>
      )}
      {selected === null ? null : (
        <EventCard
          t={t}
          event={selected.event}
          calendars={calendars}
          sources={sources}
          {...(selected.point === undefined ? {} : { point: selected.point })}
          onClose={() => { setSelected(null) }}
        />
      )}
    </div>
  )
}
