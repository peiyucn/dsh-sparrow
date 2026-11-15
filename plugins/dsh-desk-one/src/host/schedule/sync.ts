/**
 * Schedule sync orchestration: mirror window pull order and the "one failure never blocks the other
 * sources" rule. Sources run sequentially so one slow line cannot starve the others, and **every**
 * source pull goes through one single-flight slot per source: repeated clicks, post-connection
 * warm-ups and the UI's sync button all join the running pull instead of stacking writes.
 */

import type { Context } from '@deepseek-ai/cordis'
import { SCHEDULE_MAX_EVENTS, SCHEDULE_REQUEST_TIMEOUT_MS } from '../../constants.js'
import type {
  DeskScheduleSource, ScheduleSyncResponse, ScheduleSyncSourceReport,
} from '../../contract.js'
import { DeskError } from '../http.js'
import type { DeskStore } from '../store.js'
import {
  discoverCalDav, listCalDavCalendars, queryCalDavEvents,
} from './caldav.js'
import { parseIcsEvents } from './ical.js'
import { fetchOutlookIcs } from './providers/outlook-ics.js'
import { fetchGraphCalendarEvents, listGraphCalendars } from './providers/graph.js'
import { draftFromRemote, scheduleErrorOf, type EventDraft } from './records.js'
import { adapterDeps, CREDENTIAL_REF, mirrorWindow, PROVIDER_BASE_URL, resolveSecret } from './connections.js'

/** Facade seams the sync layer cannot import directly without a cycle. */
export interface ScheduleSyncDeps {
  /** Graph access-token seam, owned by the OAuth module (which caches the refresh). */
  readonly graphToken: (source: DeskScheduleSource) => Promise<string>
}

function dedupeDrafts(drafts: readonly EventDraft[]): EventDraft[] {
  const seen = new Map<string, EventDraft>()
  for (const draft of drafts) {
    if (draft.externalId !== '' && draft.uid !== '') seen.set(draft.externalId, draft)
  }
  return [...seen.values()]
}

/** Calendar collection identity: pathname when the adapter returned an absolute URL. */
function safePathname(value: string): string {
  try {
    const url = new URL(value)
    return url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`
  } catch {
    return value
  }
}

export class ScheduleSync {
  private readonly inflight = new Map<string, Promise<ScheduleSyncSourceReport>>()

  constructor(private readonly ctx: Context, private readonly store: DeskStore, private readonly deps: ScheduleSyncDeps) {}

  /** Sync every enabled source; sources run sequentially so one slow line cannot starve the others. */
  async sync(): Promise<ScheduleSyncResponse> {
    const sources = this.store.listScheduleSources().filter(source => source.enabled)
    const reports: ScheduleSyncSourceReport[] = []
    for (const source of sources) {
      reports.push(await this.runSync(source))
    }
    return { syncedAt: new Date().toISOString(), sources: reports }
  }

  /** Single-flight per source: repeated clicks join the running sync instead of stacking pulls. */
  private runSync(source: DeskScheduleSource): Promise<ScheduleSyncSourceReport> {
    const key = source.id
    const running = this.inflight.get(key)
    if (running !== undefined) return running
    const task = this.pullSource(source).finally(() => { this.inflight.delete(key) })
    this.inflight.set(key, task)
    return task
  }

  /**
   * Pull one source now. Every caller (UI sync, connection actions, OAuth warm-up) goes through the
   * per-source single-flight slot, so a warm-up cannot race the UI sync into duplicate writes.
   */
  syncSource(source: DeskScheduleSource): Promise<ScheduleSyncSourceReport> {
    return this.runSync(source)
  }

  /** One pull of one source (joined through {@link runSync} — never call directly from outside). */
  private async pullSource(source: DeskScheduleSource): Promise<ScheduleSyncSourceReport> {
    const now = new Date().toISOString()
    await this.store.setScheduleSyncState(source.id, { syncState: 'syncing' })
    const window = mirrorWindow()
    try {
      let totalEvents = 0
      let calendarCount = 0
      if (source.provider === 'outlook' && source.channel === 'graph') {
        const token = await this.deps.graphToken(source)
        const remoteCalendars = await listGraphCalendars(token, adapterDeps())
        const stored = await this.store.upsertCalendars(source, remoteCalendars.map(item => ({
          remoteId: item.id, displayName: item.name,
        })))
        calendarCount = stored.length
        for (const calendar of stored.filter(row => row.enabled)) {
          try {
            const drafts = dedupeDrafts(await fetchGraphCalendarEvents(token, calendar.remoteId, window, adapterDeps()))
            // Count what was actually mirrored, not the raw remote batch: the store caps one sync.
            const inserted = Math.min(drafts.length, SCHEDULE_MAX_EVENTS)
            await this.store.syncCalendarEvents(calendar, drafts.slice(0, inserted))
            await this.store.setScheduleSyncState(calendar.id, { lastSyncedAt: now })
            totalEvents += inserted
          } catch (error) {
            await this.store.setScheduleSyncState(calendar.id, { lastError: scheduleErrorOf(error) })
          }
        }
      } else if (source.provider === 'ics') {
        const url = await resolveSecret(this.ctx, source.credentialRef ?? CREDENTIAL_REF.ics)
        // Provider-agnostic subscription: public hosts only (the Outlook published-link whitelist
        // belongs to the outlook channel below).
        const fetched = await fetchOutlookIcs(url, { timeoutMs: SCHEDULE_REQUEST_TIMEOUT_MS, hostPolicy: 'public' })
        if (fetched.ics === undefined) throw new DeskError('SCHEDULE_UNAVAILABLE', '订阅链接没有返回内容', 502)
        const [calendar] = await this.store.upsertCalendars(source, [
          { remoteId: 'ics-published', displayName: source.account ?? 'ICS 订阅' },
        ])
        if (calendar !== undefined) {
          const drafts = dedupeDrafts(parseIcsEvents(fetched.ics, {
            provider: 'ics', calendarRemoteId: calendar.remoteId, window,
          }).map(event => draftFromRemote(event)))
          const inserted = Math.min(drafts.length, SCHEDULE_MAX_EVENTS)
          await this.store.syncCalendarEvents(calendar, drafts.slice(0, inserted))
          await this.store.setScheduleSyncState(calendar.id, { lastSyncedAt: now })
          totalEvents += inserted
          calendarCount = 1
        }
      } else if (source.provider === 'outlook') {
        const url = await resolveSecret(this.ctx, CREDENTIAL_REF.outlook)
        const fetched = await fetchOutlookIcs(url, { timeoutMs: SCHEDULE_REQUEST_TIMEOUT_MS })
        if (fetched.ics === undefined) throw new DeskError('SCHEDULE_UNAVAILABLE', '发布日历链接没有返回内容', 502)
        const [calendar] = await this.store.upsertCalendars(source, [
          { remoteId: 'outlook-published', displayName: 'Outlook 发布日历' },
        ])
        if (calendar !== undefined) {
          const drafts = dedupeDrafts(parseIcsEvents(fetched.ics, {
            provider: 'outlook', calendarRemoteId: calendar.remoteId, window,
          }).map(event => draftFromRemote(event)))
          const inserted = Math.min(drafts.length, SCHEDULE_MAX_EVENTS)
          await this.store.syncCalendarEvents(calendar, drafts.slice(0, inserted))
          await this.store.setScheduleSyncState(calendar.id, { lastSyncedAt: now })
          totalEvents += inserted
          calendarCount = 1
        }
      } else {
        const baseUrl = PROVIDER_BASE_URL[source.provider]
        if (baseUrl === undefined) throw new DeskError('INVALID_SCHEDULE', '未知的日程来源', 400)
        const auth = { user: source.account ?? '', password: await resolveSecret(this.ctx, CREDENTIAL_REF[source.provider]) }
        const { homeUrl } = await discoverCalDav(baseUrl, auth, adapterDeps())
        const calendars = await listCalDavCalendars(homeUrl, auth, adapterDeps())
        // Store the collection path, not the absolute URL: iCloud moves between `pNN-` shards
        // between sessions, and the path is the stable identity of one calendar.
        const stored = await this.store.upsertCalendars(source, calendars.map(calendar => {
          const pathname = safePathname(calendar.remoteId)
          return { remoteId: pathname, displayName: calendar.displayName }
        }))
        calendarCount = stored.length
        for (const calendar of stored.filter(row => row.enabled)) {
          try {
            const calendarUrl = new URL(calendar.remoteId, homeUrl).href
            const remoteEvents = await queryCalDavEvents(calendarUrl, window, auth, adapterDeps())
            const parsed = remoteEvents.flatMap(response => parseIcsEvents(response.ics, {
              provider: source.provider, calendarRemoteId: calendar.remoteId, window,
            }))
            const drafts = dedupeDrafts(parsed.map(event => draftFromRemote(event)))
            const inserted = Math.min(drafts.length, SCHEDULE_MAX_EVENTS)
            await this.store.syncCalendarEvents(calendar, drafts.slice(0, inserted))
            await this.store.setScheduleSyncState(calendar.id, { lastSyncedAt: now })
            totalEvents += inserted
          } catch (error) {
            await this.store.setScheduleSyncState(calendar.id, { lastError: scheduleErrorOf(error) })
          }
        }
      }
      await this.store.setScheduleSyncState(source.id, { syncState: 'idle', lastSyncedAt: now })
      return { provider: source.provider, channel: source.channel, ok: true, calendars: calendarCount, events: totalEvents }
    } catch (error) {
      const failure = scheduleErrorOf(error)
      await this.store.setScheduleSyncState(source.id, { syncState: 'error', lastError: failure })
      return { provider: source.provider, channel: source.channel, ok: false, calendars: 0, events: 0, error: failure }
    }
  }
}
