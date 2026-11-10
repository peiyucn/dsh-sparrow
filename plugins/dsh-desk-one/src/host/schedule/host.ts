/**
 * Schedule host orchestration (S2, read-only): connection records → credentials → provider pull →
 * mirrored events. The adapters stay stateless; this module owns the sync order, window and the
 * "one failure never blocks the other sources" rule.
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import {
  ICLOUD_PASSWORD_REF, OUTLOOK_ICS_URL_REF, SCHEDULE_FUTURE_MONTHS, SCHEDULE_MAX_EVENTS,
  SCHEDULE_PAST_MONTHS, SCHEDULE_REQUEST_TIMEOUT_MS, WECOM_PASSWORD_REF,
  type ScheduleChannel, type ScheduleProvider,
} from '../../constants.js'
import type {
  DeskCalendar, DeskScheduleSource, OutlookLoginPollResponse, OutlookLoginStartResponse, ScheduleConnectionInput,
  ScheduleConnectionTestResponse, ScheduleSubscriptionInput,
  ScheduleEventListResponse, ScheduleStateResponse, ScheduleSyncResponse, ScheduleSyncSourceReport,
} from '../../contract.js'
import { DeskError } from '../http.js'
import type { DeskStore } from '../store.js'
import { OUTLOOK_GRAPH_REFRESH_REF } from '../../constants.js'
import {
  discoverCalDav, listCalDavCalendars, queryCalDavEvents, type CalDavDeps,
} from './caldav.js'
import { parseIcsEvents } from './ical.js'
import { fetchOutlookIcs } from './providers/outlook-ics.js'
import {
  codeChallenge, exchangeGraphCode, fetchGraphCalendarEvents, graphAuthorizeUrl, listGraphCalendars, pollGraphDeviceCode,
  refreshGraphToken, startGraphDeviceCode,
} from './providers/graph.js'
import { scheduleErrorOf, type EventDraft } from './records.js'
import { ScheduleError, type PullWindow } from './types.js'

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
  ics: 'ics',
}

const CREDENTIAL_REF: Record<ScheduleProvider, string> = {
  wecom: WECOM_PASSWORD_REF,
  icloud: ICLOUD_PASSWORD_REF,
  outlook: OUTLOOK_ICS_URL_REF,
  ics: 'DESK_ONE_ICS_URL',
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
  return value === 'wecom' || value === 'icloud' || value === 'outlook' || value === 'ics'
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

type OutlookFlow =
  | { kind: 'device'; deviceCode: string; expiresAt: number }
  | {
      kind: 'redirect'
      verifier: string
      state: string
      redirectUri: string
      expiresAt: number
      completed?: ScheduleStateResponse
    }

export class ScheduleHost {
  private readonly inflight = new Map<string, Promise<ScheduleSyncSourceReport>>()

  private readonly outlookFlows = new Map<string, OutlookFlow>()
  private readonly graphAccess = new Map<string, { token: string; expiresAt: number }>()

  constructor(private readonly ctx: Context, private readonly store: DeskStore) {}

  /** Browser redirect login (default) or device code (fallback). */
  async startOutlookLogin(redirectUri?: string): Promise<OutlookLoginStartResponse> {
    if (redirectUri !== undefined && redirectUri !== '') {
      const parsed = new URL(redirectUri)
      if (parsed.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(parsed.hostname)
        || !parsed.pathname.endsWith('/api/desk-one/schedule/outlook/callback')) {
        throw new DeskError('INVALID_SCHEDULE', '登录回调地址必须是本机 desk-one 的 callback 路由', 400)
      }
      const verifier = randomUUID() + randomUUID()
      const state = randomUUID()
      const flowId = randomUUID()
      this.outlookFlows.set(flowId, {
        kind: 'redirect',
        verifier,
        state,
        redirectUri,
        expiresAt: Date.now() + 10 * 60_000,
      })
      return {
        flowId,
        kind: 'redirect',
        authUrl: graphAuthorizeUrl({ redirectUri, state, challenge: await codeChallenge(verifier) }),
        userCode: '',
        verificationUri: '',
        expiresIn: 600,
        interval: 2,
      }
    }
    const code = await startGraphDeviceCode(this.adapterDeps())
    const flowId = randomUUID()
    this.outlookFlows.set(flowId, { kind: 'device', deviceCode: code.deviceCode, expiresAt: Date.now() + code.expiresIn * 1000 })
    return {
      flowId,
      kind: 'device',
      userCode: code.userCode,
      verificationUri: code.verificationUri,
      expiresIn: code.expiresIn,
      interval: code.interval,
    }
  }

  async pollOutlookLogin(flowId: unknown): Promise<OutlookLoginPollResponse> {
    const id = text(flowId)
    const flow = this.outlookFlows.get(id)
    if (flow === undefined || flow.expiresAt <= Date.now()) {
      this.outlookFlows.delete(id)
      throw new DeskError('SCHEDULE_AUTH_EXPIRED', '登录已过期，请重新发起', 409)
    }
    if (flow.kind === 'redirect') {
      return flow.completed === undefined
        ? { status: 'pending' }
        : { status: 'connected', state: flow.completed }
    }
    let tokens
    try {
      tokens = await pollGraphDeviceCode(flow.deviceCode, this.adapterDeps())
    } catch (error) {
      // A pending device code is a normal poll result, not a page-level error.
      if (error instanceof ScheduleError && error.kind === 'TRANSIENT') {
        return { status: 'pending', message: error.message }
      }
      throw error
    }
    if (tokens === null || tokens.refreshToken === undefined) return { status: 'pending' }
    this.outlookFlows.delete(id)
    return this.finishOutlookLogin(tokens.refreshToken)
  }

  /** OAuth redirect callback: exchange the code, persist the refresh token, warm one sync. */
  async completeOutlookLogin(code: unknown, state: unknown): Promise<{ ok: boolean; message: string }> {
    const value = text(code)
    const stateId = text(state)
    const entry = [...this.outlookFlows.entries()].find(([, flow]) => flow.kind === 'redirect' && flow.state === stateId)
    if (entry === undefined) return { ok: false, message: '登录状态已过期，请回到 Desk One 重新点击登录。' }
    const [, flow] = entry
    if (flow.kind !== 'redirect') return { ok: false, message: '登录状态无效。' }
    try {
      const tokens = await exchangeGraphCode({ code: value, redirectUri: flow.redirectUri, verifier: flow.verifier }, this.adapterDeps())
      if (tokens.refreshToken === undefined) return { ok: false, message: 'Microsoft 没有返回 refresh token，请重试。' }
      const result = await this.finishOutlookLogin(tokens.refreshToken)
      flow.completed = result.state
      return { ok: true, message: 'Outlook 已连接，请回到 Desk One 关闭本窗口。' }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  private async finishOutlookLogin(refreshToken: string): Promise<OutlookLoginPollResponse> {
    const service = this.requireCredentials()
    await service.set(OUTLOOK_GRAPH_REFRESH_REF, refreshToken)
    const source = await this.store.upsertScheduleSource({
      provider: 'outlook',
      channel: 'graph',
      account: 'Outlook 个人账户',
      credentialRef: OUTLOOK_GRAPH_REFRESH_REF,
    })
    await this.syncSource(source).catch(() => undefined)
    return { status: 'connected', state: this.state() }
  }

  async disconnectOutlookGraph(): Promise<ScheduleStateResponse> {
    const source = this.store.findScheduleSource('outlook', 'graph')
    const service = this.credentials()
    if (service !== undefined) await service.unset(OUTLOOK_GRAPH_REFRESH_REF).catch(() => undefined)
    this.graphAccess.clear()
    if (source !== undefined) await this.store.removeScheduleSource(source.id)
    return this.state()
  }

  private async graphToken(source: DeskScheduleSource): Promise<string> {
    const cached = this.graphAccess.get(source.id)
    if (cached !== undefined && cached.expiresAt > Date.now() + 60_000) return cached.token
    const refreshToken = await this.resolveSecret(source.credentialRef ?? OUTLOOK_GRAPH_REFRESH_REF)
    const tokens = await refreshGraphToken(refreshToken, this.adapterDeps())
    this.graphAccess.set(source.id, { token: tokens.accessToken, expiresAt: Date.now() + tokens.expiresIn * 1000 })
    if (tokens.refreshToken !== undefined) {
      const service = this.requireCredentials()
      await service.set(OUTLOOK_GRAPH_REFRESH_REF, tokens.refreshToken).catch(() => undefined)
    }
    return tokens.accessToken
  }


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
    if (input.provider === 'outlook' || input.provider === 'ics') {
      const url = text(input.url)
      if (url === '') throw new DeskError('INVALID_SCHEDULE', '请填写 ICS 订阅链接', 400)
      const result = await fetchOutlookIcs(url, { timeoutMs: SCHEDULE_REQUEST_TIMEOUT_MS })
      if (result.ics === undefined) throw new DeskError('SCHEDULE_UNAVAILABLE', '这个链接没有返回日历内容', 400)
      const window = mirrorWindow()
      const events = parseIcsEvents(result.ics, { provider: input.provider, calendarRemoteId: 'published', window })
      return {
        provider: input.provider,
        calendars: 1,
        events: events.length,
        message: `已读到 ${events.length} 条日程`,
      }
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
    if (input.provider === 'ics') throw new DeskError('INVALID_SCHEDULE', '订阅请使用订阅接口', 400)
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

  /** Add one provider-agnostic ICS subscription (each subscription is its own source). */
  async addSubscription(input: ScheduleSubscriptionInput): Promise<ScheduleStateResponse> {
    const url = text(input.url)
    if (url === '') throw new DeskError('INVALID_SCHEDULE', '请填写 ICS 订阅链接', 400)
    // Validate before persisting the URL in the credential store.
    const fetched = await fetchOutlookIcs(url, { timeoutMs: SCHEDULE_REQUEST_TIMEOUT_MS })
    if (fetched.ics === undefined) throw new DeskError('SCHEDULE_UNAVAILABLE', '这个链接没有返回日历内容', 400)
    const name = text(input.name)
    const credentialRef = `DESK_ONE_ICS_URL_${randomUUID()}`
    const service = this.requireCredentials()
    const source = await this.store.createScheduleSource({
      provider: 'ics',
      channel: 'ics',
      account: name === '' ? new URL(url).hostname : name,
      credentialRef,
    })
    await service.set(credentialRef, url)
    await this.syncSource(source).catch(() => undefined)
    return this.state()
  }

  /** Remove one subscription plus its mirrored calendar/events; remote content is untouched. */
  async removeSubscription(sourceId: unknown): Promise<ScheduleStateResponse> {
    const id = text(sourceId)
    const source = this.store.getScheduleSource(id)
    if (source === undefined || source.provider !== 'ics') {
      throw new DeskError('INVALID_SCHEDULE', '订阅不存在', 404)
    }
    const service = this.credentials()
    if (service !== undefined && source.credentialRef !== undefined) {
      await service.unset(source.credentialRef).catch(() => undefined)
    }
    await this.store.removeScheduleSource(source.id)
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
      if (source.provider === 'outlook' && source.channel === 'graph') {
        const token = await this.graphToken(source)
        const remoteCalendars = await listGraphCalendars(token, this.adapterDeps())
        const stored = await this.store.upsertCalendars(source, remoteCalendars.map(item => ({
          remoteId: item.id, displayName: item.name,
        })))
        calendarCount = stored.length
        for (const calendar of stored.filter(row => row.enabled)) {
          try {
            const drafts = dedupeDrafts(await fetchGraphCalendarEvents(token, calendar.remoteId, window, this.adapterDeps()))
            await this.store.syncCalendarEvents(calendar, drafts.slice(0, SCHEDULE_MAX_EVENTS))
            await this.store.setScheduleSyncState(calendar.id, { lastSyncedAt: now })
            totalEvents += drafts.length
          } catch (error) {
            await this.store.setScheduleSyncState(calendar.id, { lastError: scheduleErrorOf(error) })
          }
        }
      } else if (source.provider === 'ics') {
        const url = await this.resolveSecret(source.credentialRef ?? CREDENTIAL_REF.ics)
        const fetched = await fetchOutlookIcs(url, { timeoutMs: SCHEDULE_REQUEST_TIMEOUT_MS })
        if (fetched.ics === undefined) throw new DeskError('SCHEDULE_UNAVAILABLE', '订阅链接没有返回内容', 502)
        const [calendar] = await this.store.upsertCalendars(source, [
          { remoteId: 'ics-published', displayName: source.account ?? 'ICS 订阅' },
        ])
        if (calendar !== undefined) {
          const drafts = dedupeDrafts(parseIcsEvents(fetched.ics, {
            provider: 'ics', calendarRemoteId: calendar.remoteId, window,
          }).map(event => this.draftOf(event)))
          await this.store.syncCalendarEvents(calendar, drafts.slice(0, SCHEDULE_MAX_EVENTS))
          await this.store.setScheduleSyncState(calendar.id, { lastSyncedAt: now })
          totalEvents += drafts.length
          calendarCount = 1
        }
      } else if (source.provider === 'outlook') {
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
