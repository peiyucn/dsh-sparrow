/**
 * Schedule host orchestration (S2, read-only): connection records → credentials → provider pull →
 * mirrored events. The adapters stay stateless; this module owns the sync order, window and the
 * "one failure never blocks the other sources" rule.
 */

import type { Context } from '@deepseek-ai/cordis'
import {
  ICLOUD_PASSWORD_REF, OUTLOOK_ICS_URL_REF, SCHEDULE_FUTURE_MONTHS, SCHEDULE_MAX_EVENTS,
  SCHEDULE_PAST_MONTHS, SCHEDULE_REQUEST_TIMEOUT_MS, WECOM_PASSWORD_REF,
  type ScheduleChannel, type ScheduleProvider,
} from '../../constants.js'
import type {
  DeskCalendar, DeskScheduleSource, ScheduleConnectionInput, ScheduleConnectionTestResponse,
  ScheduleEventListResponse, ScheduleStateResponse, ScheduleSyncResponse, ScheduleSyncSourceReport,
} from '../../contract.js'
import { DeskError } from '../http.js'
import type { DeskStore } from '../store.js'
import {
  discoverCalDav, listCalDavCalendars, queryCalDavEvents, type CalDavDeps,
} from './caldav.js'
import { parseIcsEvents } from './ical.js'
import { fetchOutlookIcs } from './providers/outlook-ics.js'
import { scheduleErrorOf, type EventDraft } from './records.js'

/** The adapters take an ISO UTC window and format protocol-specific stamps themselves. */
export interface PullWindow { readonly startUtc: string; readonly endUtc: string }

/** Structural view of the official credentials seam (avoids a hard package dependency). */
interface CredentialsLike {
  resolve(ref: string): Promise<{ value: string } | undefined>
  set(ref: string, value: string): Promise<void>
  unset(ref: string): Promise<void>
}

const PROVIDER_BASE_URL: Partial<Record<ScheduleProvider, string>> = {
  wecom: 'https://caldav.wecom.work',
  icloud: 'https://caldav.icloud.com',
}

const PROVIDER_CHANNEL: Record<ScheduleProvider, ScheduleChannel> = {
  wecom: 'caldav',
  icloud: 'caldav',
  outlook: 'ics',
}

const CREDENTIAL_REF: Record<ScheduleProvider, string> = {
  wecom: WECOM_PASSWORD_REF,
  icloud: ICLOUD_PASSWORD_REF,
  outlook: OUTLOOK_ICS_URL_REF,
}

/** Mirror window: `[-6, +3]` months around now, ISO UTC. */
export function mirrorWindow(now = new Date()): PullWindow & { from: string; to: string } {
  const start = new Date(now)
  start.setUTCMonth(start.getUTCMonth() - SCHEDULE_PAST_MONTHS)
  const end = new Date(now)
  end.setUTCMonth(end.getUTCMonth() + SCHEDULE_FUTURE_MONTHS)
  return { startUtc: start.toISOString(), endUtc: end.toISOString(), from: start.toISOString(), to: end.toISOString() }
}

function isProvider(value: unknown): value is ScheduleProvider {
  return value === 'wecom' || value === 'icloud' || value === 'outlook'
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
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

function dedupeDrafts(drafts: readonly EventDraft[]): EventDraft[] {
  const seen = new Map<string, EventDraft>()
  for (const draft of drafts) {
    if (draft.externalId !== '' && draft.uid !== '') seen.set(draft.externalId, draft)
  }
  return [...seen.values()]
}

export class ScheduleHost {
  private readonly inflight = new Map<string, Promise<ScheduleSyncSourceReport>>()

  constructor(private readonly ctx: Context, private readonly store: DeskStore) {}

  private credentials(): CredentialsLike | undefined {
    const service = this.ctx.get('credentials')
    return service === undefined ? undefined : service as unknown as CredentialsLike
  }

  private requireCredentials(): CredentialsLike {
    const service = this.credentials()
    if (service === undefined) {
      throw new DeskError('SCHEDULE_UNAVAILABLE', '宿主没有提供凭据服务，无法保存日程连接', 503)
    }
    return service
  }

  private adapterDeps(): CalDavDeps {
    return { timeoutMs: SCHEDULE_REQUEST_TIMEOUT_MS }
  }

  private async resolveSecret(ref: string): Promise<string> {
    const service = this.requireCredentials()
    const hit = await service.resolve(ref)
    if (hit === undefined || hit.value === '') {
      throw new DeskError('SCHEDULE_NOT_CONNECTED', '日程连接还没有保存凭据', 409)
    }
    return hit.value
  }

  /** Connection records + calendars + per-calendar counts for the schedule page. */
  state(): ScheduleStateResponse {
    const counts = this.store.countEventsByCalendar()
    const calendars = this.store.listCalendars()
    return {
      sources: this.store.listScheduleSources(),
      calendars,
      counts: Object.fromEntries([...counts.entries()]),
    }
  }

  /** Range events for the list / month / week views. */
  events(from: string, to: string, calendarIds?: readonly string[], provider?: ScheduleProvider): ScheduleEventListResponse {
    if (!Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || from >= to) {
      throw new DeskError('INVALID_SCHEDULE', '时间区间不合法', 400)
    }
    const events = this.store.listEvents({ from, to, calendarIds, provider })
    return { events, from, to }
  }

  /** Test without saving: discovery + one calendar list, or one ICS fetch + parse. */
  async test(input: ScheduleConnectionInput): Promise<ScheduleConnectionTestResponse> {
    if (!isProvider(input.provider)) throw new DeskError('INVALID_SCHEDULE', '未知的日程来源', 400)
    if (input.provider === 'outlook') {
      const url = text(input.url)
      if (url === '') throw new DeskError('INVALID_SCHEDULE', '请填写 Outlook 发布日历的 ICS 链接', 400)
      const result = await fetchOutlookIcs(url, { timeoutMs: SCHEDULE_REQUEST_TIMEOUT_MS })
      if (result.ics === undefined) throw new DeskError('SCHEDULE_UNAVAILABLE', '这个链接没有返回日历内容', 400)
      const window = mirrorWindow()
      const events = parseIcsEvents(result.ics, { provider: 'outlook', calendarRemoteId: 'published', window })
      return { provider: 'outlook', calendars: 1, events: events.length, message: `已读到 ${events.length} 条日程` }
    }
    const account = text(input.account)
    const password = text(input.password)
    if (account === '' || password === '') {
      throw new DeskError('INVALID_SCHEDULE', '请填写账号与同步密码', 400)
    }
    const baseUrl = PROVIDER_BASE_URL[input.provider]
    if (baseUrl === undefined) throw new DeskError('INVALID_SCHEDULE', '未知的日程来源', 400)
    const { homeUrl } = await discoverCalDav(baseUrl, { user: account, password }, this.adapterDeps())
    const calendars = await listCalDavCalendars(homeUrl, { user: account, password }, this.adapterDeps())
    return {
      provider: input.provider,
      calendars: calendars.length,
      events: 0,
      message: `连接成功，找到 ${calendars.length} 本日历`,
    }
  }

  /** Save (or replace) one connection, then try one sync; sync failure is recorded, not thrown. */
  async saveConnection(input: ScheduleConnectionInput): Promise<ScheduleStateResponse> {
    if (!isProvider(input.provider)) throw new DeskError('INVALID_SCHEDULE', '未知的日程来源', 400)
    // Product rule: a connection must pass a real test before its secret is stored.
    await this.test(input)
    const ref = CREDENTIAL_REF[input.provider]
    const channel = PROVIDER_CHANNEL[input.provider]
    const service = this.requireCredentials()

    if (input.provider === 'outlook') {
      const url = text(input.url)
      if (url === '') throw new DeskError('INVALID_SCHEDULE', '请填写 Outlook 发布日历的 ICS 链接', 400)
      await service.set(ref, url)
      await this.store.upsertScheduleSource({ provider: 'outlook', channel, credentialRef: ref, account: text(input.account) || 'Outlook 发布日历' })
    } else {
      const account = text(input.account)
      const password = text(input.password)
      if (account === '' || password === '') {
        throw new DeskError('INVALID_SCHEDULE', '请填写账号与同步密码', 400)
      }
      await service.set(ref, password)
      await this.store.upsertScheduleSource({ provider: input.provider, channel, credentialRef: ref, account })
    }

    const source = this.store.findScheduleSource(input.provider, channel)
    if (source !== undefined) await this.syncSource(source).catch(() => undefined)
    return this.state()
  }

  /** Remove one connection plus its calendars and mirrored events (local only; remote untouched). */
  async removeConnection(provider: unknown): Promise<ScheduleStateResponse> {
    if (!isProvider(provider)) throw new DeskError('INVALID_SCHEDULE', '未知的日程来源', 400)
    const channel = PROVIDER_CHANNEL[provider]
    const source = this.store.findScheduleSource(provider, channel)
    const service = this.credentials()
    if (service !== undefined) await service.unset(CREDENTIAL_REF[provider]).catch(() => undefined)
    if (source !== undefined) await this.store.removeScheduleSource(source.id)
    return this.state()
  }

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
    const task = this.syncSource(source).finally(() => { this.inflight.delete(key) })
    this.inflight.set(key, task)
    return task
  }

  private async syncSource(source: DeskScheduleSource): Promise<ScheduleSyncSourceReport> {
    const now = new Date().toISOString()
    await this.store.setScheduleSyncState(source.id, { syncState: 'syncing' })
    const window = mirrorWindow()
    try {
      let totalEvents = 0
      let calendarCount = 0
      if (source.provider === 'outlook') {
        const url = await this.resolveSecret(CREDENTIAL_REF.outlook)
        const fetched = await fetchOutlookIcs(url, { timeoutMs: SCHEDULE_REQUEST_TIMEOUT_MS })
        if (fetched.ics === undefined) throw new DeskError('SCHEDULE_UNAVAILABLE', '发布日历链接没有返回内容', 502)
        const [calendar] = await this.store.upsertCalendars(source, [
          { remoteId: 'outlook-published', displayName: 'Outlook 发布日历' },
        ])
        if (calendar !== undefined) {
          const drafts = dedupeDrafts(parseIcsEvents(fetched.ics, {
            provider: 'outlook', calendarRemoteId: calendar.remoteId, window,
          }).map(event => this.draftOf(event)))
          await this.store.syncCalendarEvents(calendar, drafts.slice(0, SCHEDULE_MAX_EVENTS))
          await this.store.setScheduleSyncState(calendar.id, { lastSyncedAt: now })
          totalEvents += drafts.length
          calendarCount = 1
        }
      } else {
        const baseUrl = PROVIDER_BASE_URL[source.provider]
        if (baseUrl === undefined) throw new DeskError('INVALID_SCHEDULE', '未知的日程来源', 400)
        const auth = { user: source.account ?? '', password: await this.resolveSecret(CREDENTIAL_REF[source.provider]) }
        const { homeUrl } = await discoverCalDav(baseUrl, auth, this.adapterDeps())
        const calendars = await listCalDavCalendars(homeUrl, auth, this.adapterDeps())
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
            const remoteEvents = await queryCalDavEvents(calendarUrl, window, auth, this.adapterDeps())
            const parsed = remoteEvents.flatMap(response => parseIcsEvents(response.ics, {
              provider: source.provider, calendarRemoteId: calendar.remoteId, window,
            }))
            const drafts = dedupeDrafts(parsed.map(event => this.draftOf(event)))
            await this.store.syncCalendarEvents(calendar, drafts.slice(0, SCHEDULE_MAX_EVENTS))
            await this.store.setScheduleSyncState(calendar.id, { lastSyncedAt: now })
            totalEvents += drafts.length
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

  /** Adapter events carry provider-owned fields; the store only needs the draft shape. */
  private draftOf(event: {
    readonly externalId: string; readonly uid: string; readonly recurrenceId?: string
    readonly title: string; readonly description?: string; readonly location?: string
    readonly startUtc: string; readonly endUtc: string; readonly allDay: boolean
    readonly timezone: string; readonly busy: boolean; readonly url?: string; readonly rrule?: string
  }): EventDraft {
    return {
      externalId: event.externalId,
      uid: event.uid,
      ...(event.recurrenceId === undefined ? {} : { recurrenceId: event.recurrenceId }),
      title: event.title,
      ...(event.description === undefined ? {} : { description: event.description }),
      ...(event.location === undefined ? {} : { location: event.location }),
      start: event.startUtc,
      end: event.endUtc,
      allDay: event.allDay,
      timezone: event.timezone,
      busy: event.busy,
      ...(event.url === undefined ? {} : { url: event.url }),
      ...(event.rrule === undefined ? {} : { rrule: event.rrule }),
    }
  }
}

/** Calendar lifecycle helpers kept on the store; declared here for the route layer's import list. */
export type { DeskCalendar }
