/**
 * Schedule page (S2, read-only aggregation).
 *
 * Fixed page partitions: upcoming rail (next 7 days) · main view (list / month / week) ·
 * calendar sources (provider → calendar). The page never collapses into a single calendar widget;
 * narrow widths stack the same three areas. All data comes from the host mirror via the schedule API.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
  SCHEDULE_HIDDEN_STORAGE_KEY, SCHEDULE_LIST_DAYS, SCHEDULE_SYNC_INTERVAL_MS, SCHEDULE_VIEW_STORAGE_KEY,
} from '../../constants.js'
import type { DeskCalendar, DeskEvent, ScheduleStateResponse } from '../../contract.js'
import type { DeskTranslator } from '../app/types.js'
import type { ScheduleApi } from './api.js'
import {
  addDays, listRange, monthRange, startOfLocalDay, weekRange, type ScheduleViewName,
} from './utils.js'
import {
  CalendarSources, ConnectionsPanel, EventDetail, MonthBoard, ScheduleToolbar, UpcomingRail, WeekBoard,
  ListBoard,
} from './components.js'

export interface ScheduleViewProps {
  readonly t: DeskTranslator
  readonly api: ScheduleApi
}

function readView(): ScheduleViewName {
  try {
    const stored = window.localStorage.getItem(SCHEDULE_VIEW_STORAGE_KEY)
    if (stored === 'list' || stored === 'month' || stored === 'week') return stored
  } catch {
    // Storage unavailable: fall back to the default view for this session.
  }
  return 'list'
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

export function ScheduleView({ t, api }: ScheduleViewProps): ReactElement {
  const today = useMemo(() => startOfLocalDay(new Date()), [])
  const [view, setView] = useState<ScheduleViewName>(readView)
  const [cursor, setCursor] = useState<Date>(today)
  const [state, setState] = useState<ScheduleStateResponse | null>(null)
  const [events, setEvents] = useState<readonly DeskEvent[]>([])
  const [hidden, setHidden] = useState<Set<string>>(readHidden)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [selected, setSelected] = useState<DeskEvent | null>(null)
  const [showConnections, setShowConnections] = useState(false)
  const [listDays, setListDays] = useState(SCHEDULE_LIST_DAYS)
  const syncingRef = useRef(false)

  const range = useMemo(() => {
    if (view === 'month') return monthRange(cursor)
    if (view === 'week') return weekRange(cursor)
    return listRange(today, listDays)
  }, [cursor, listDays, today, view])

  const load = useCallback(async (): Promise<ScheduleStateResponse> => {
    const [nextState, payload] = await Promise.all([
      api.loadState(),
      api.loadEvents(range.from.toISOString(), range.to.toISOString()),
    ])
    setState(nextState)
    setEvents(payload.events)
    return nextState
  }, [api, range.from, range.to])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    load()
      .then(() => { if (!cancelled) setError(null) })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (!cancelled) setLoading(false) })
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

  // First paint: sync when the mirror has never synced or the last pull is older than the policy.
  useEffect(() => {
    if (state === null || state.sources.length === 0) return
    const newest = state.sources
      .map(source => (source.lastSyncedAt === undefined ? 0 : Date.parse(source.lastSyncedAt)))
      .reduce((max, value) => Math.max(max, value), 0)
    if (Date.now() - newest > 5 * 60_000) void runSync()
  }, [runSync, state])

  // Keep a light 15-minute refresh while the panel stays open; cleanup on unmount.
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

  const toggleHidden = useCallback((calendar: DeskCalendar): void => {
    setHidden(previous => {
      const next = new Set(previous)
      if (next.has(calendar.id)) next.delete(calendar.id)
      else next.add(calendar.id)
      try {
        window.localStorage.setItem(SCHEDULE_HIDDEN_STORAGE_KEY, JSON.stringify([...next]))
      } catch {
        // Preference only.
      }
      return next
    })
  }, [])

  const visibleEvents = useMemo(
    () => events.filter(event => !hidden.has(event.calendarNodeId)),
    [events, hidden],
  )
  const calendars = state?.calendars ?? []
  const sources = state?.sources ?? []
  const counts = state?.counts ?? {}
  const staleSources = sources.filter(source => source.syncState === 'error')

  const step = (direction: -1 | 1): void => {
    if (view === 'month') {
      const next = new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1)
      setCursor(next)
    } else if (view === 'week') {
      setCursor(addDays(cursor, direction * 7))
    } else {
      setCursor(addDays(cursor, direction * SCHEDULE_LIST_DAYS))
    }
  }

  const connectionPanel = (showConnections || sources.length === 0) ? (
    <ConnectionsPanel
      t={t}
      api={api}
      sources={sources}
      onClose={() => { setShowConnections(false) }}
      onChanged={async () => { await load() }}
    />
  ) : null

  return (
    <div className="dsh-desk-schedule">
      <ScheduleToolbar
        t={t}
        view={view}
        cursor={cursor}
        today={today}
        syncing={syncing}
        loading={loading}
        sourceCount={sources.length}
        error={staleSources.length > 0 ? staleSources[0]?.lastError?.message ?? null : error}
        onView={chooseView}
        onStep={step}
        onToday={() => { setCursor(today) }}
        onRefresh={() => { void runSync() }}
        onConnections={() => { setShowConnections(true) }}
      />

      {loading ? <p className="dsh-desk-schedule-hint">{t('state.loading' as never)}</p> : null}

      <div className="dsh-desk-schedule-grid" data-view={view}>
        <UpcomingRail
          t={t}
          today={today}
          events={visibleEvents}
          calendars={calendars}
          onOpen={setSelected}
          onViewAll={() => { chooseView('list'); setCursor(today) }}
        />
        <section className="dsh-desk-schedule-main">
          {view === 'list' ? (
            <ListBoard
              t={t}
              today={today}
              events={visibleEvents}
              calendars={calendars}
              days={listDays}
              onOpen={setSelected}
              onLoadMore={() => { setListDays(days => days + SCHEDULE_LIST_DAYS) }}
            />
          ) : view === 'month' ? (
            <MonthBoard t={t} cursor={cursor} today={today} events={visibleEvents} calendars={calendars} onOpen={setSelected} />
          ) : (
            <WeekBoard t={t} from={range.from} today={today} events={visibleEvents} calendars={calendars} onOpen={setSelected} />
          )}
        </section>
        <CalendarSources
          t={t}
          sources={sources}
          calendars={calendars}
          counts={counts}
          hidden={hidden}
          onToggle={toggleHidden}
          onConnections={() => { setShowConnections(true) }}
        />
      </div>

      {selected === null ? null : (
        <EventDetail
          t={t}
          event={selected}
          calendars={calendars}
          onClose={() => { setSelected(null) }}
        />
      )}
      {connectionPanel}
    </div>
  )
}
