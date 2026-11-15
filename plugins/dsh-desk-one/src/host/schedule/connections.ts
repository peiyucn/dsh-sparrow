/**
 * Schedule connections: credential seam, provider maps and connection / subscription CRUD.
 *
 * The provider adapters stay stateless, so this layer owns everything that outlives one pull: which
 * credential ref belongs to which provider, whether a candidate connection works before its secret
 * is stored, and the local-only removal of connections / subscriptions.
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import {
  ICLOUD_PASSWORD_REF, OUTLOOK_GRAPH_REFRESH_REF, OUTLOOK_ICS_URL_REF, SCHEDULE_FUTURE_MONTHS,
  SCHEDULE_PAST_MONTHS, SCHEDULE_REQUEST_TIMEOUT_MS, WECOM_PASSWORD_REF,
  type ScheduleChannel, type ScheduleProvider,
} from '../../constants.js'
import type {
  DeskScheduleSource, ScheduleConnectionInput, ScheduleConnectionTestResponse, ScheduleStateResponse,
  ScheduleSubscriptionInput, ScheduleSyncSourceReport,
} from '../../contract.js'
import { DeskError } from '../http.js'
import type { DeskStore } from '../store.js'
import {
  discoverCalDav, listCalDavCalendars, type CalDavDeps,
} from './caldav.js'
import { parseIcsEvents } from './ical.js'
import { fetchOutlookIcs } from './providers/outlook-ics.js'
import type { PullWindow } from './types.js'

/** Structural view of the official credentials seam (avoids a hard package dependency). */
export interface CredentialsLike {
  resolve(ref: string): Promise<{ value: string } | undefined>
  set(ref: string, value: string): Promise<void>
  unset(ref: string): Promise<void>
}

export const PROVIDER_BASE_URL: Partial<Record<ScheduleProvider, string>> = {
  wecom: 'https://caldav.wecom.work',
  icloud: 'https://caldav.icloud.com',
}

const PROVIDER_CHANNEL: Record<ScheduleProvider, ScheduleChannel> = {
  wecom: 'caldav',
  icloud: 'caldav',
  outlook: 'ics',
  ics: 'ics',
}

export const CREDENTIAL_REF: Record<ScheduleProvider, string> = {
  wecom: WECOM_PASSWORD_REF,
  icloud: ICLOUD_PASSWORD_REF,
  outlook: OUTLOOK_ICS_URL_REF,
  ics: 'DESK_ONE_ICS_URL',
}

/** Request timeout shared by every adapter call. */
export function adapterDeps(): CalDavDeps {
  return { timeoutMs: SCHEDULE_REQUEST_TIMEOUT_MS }
}

/** The plugin context's credentials seam, when the host provides one. */
export function credentialsOf(ctx: Context): CredentialsLike | undefined {
  const service = ctx.get('credentials')
  return service === undefined ? undefined : service as unknown as CredentialsLike
}

/** Credentials seam for a write path: a host without it cannot store connections. */
export function requireCredentials(ctx: Context): CredentialsLike {
  const service = credentialsOf(ctx)
  if (service === undefined) {
    throw new DeskError('SCHEDULE_UNAVAILABLE', '宿主没有提供凭据服务，无法保存日程连接', 503)
  }
  return service
}

/** Resolve one credential ref; unset / empty means the connection is not connected. */
export async function resolveSecret(ctx: Context, ref: string): Promise<string> {
  const service = requireCredentials(ctx)
  const hit = await service.resolve(ref)
  if (hit === undefined || hit.value === '') {
    throw new DeskError('SCHEDULE_NOT_CONNECTED', '日程连接还没有保存凭据', 409)
  }
  return hit.value
}

/** Mirror window: `[-6, +3]` months around now, ISO UTC. */
export function mirrorWindow(now = new Date()): PullWindow & { from: string; to: string } {
  const start = new Date(now)
  start.setUTCMonth(start.getUTCMonth() - SCHEDULE_PAST_MONTHS)
  const end = new Date(now)
  end.setUTCMonth(end.getUTCMonth() + SCHEDULE_FUTURE_MONTHS)
  return { startUtc: start.toISOString(), endUtc: end.toISOString(), from: start.toISOString(), to: end.toISOString() }
}

/** Route query / body values arrive as `unknown`; treat non-strings as the empty string. */
export function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function isProvider(value: unknown): value is ScheduleProvider {
  return value === 'wecom' || value === 'icloud' || value === 'outlook' || value === 'ics'
}

/** Facade seams the connection layer cannot import directly without a cycle. */
export interface ScheduleConnectionsDeps {
  /** Pull one source directly after a write (deliberately bypasses the shared single-flight slot). */
  readonly syncSource: (source: DeskScheduleSource) => Promise<ScheduleSyncSourceReport>
  /** Current schedule page state, returned by every successful write. */
  readonly state: () => ScheduleStateResponse
  /** Drop the cached Graph access tokens (the cache lives in the OAuth module). */
  readonly clearGraphAccess: () => void
}

export class ScheduleConnections {
  constructor(private readonly ctx: Context, private readonly store: DeskStore, private readonly deps: ScheduleConnectionsDeps) {}

  /** Test without saving: discovery + one calendar list, or one ICS fetch + parse. */
  async test(input: ScheduleConnectionInput): Promise<ScheduleConnectionTestResponse> {
    if (!isProvider(input.provider)) throw new DeskError('INVALID_SCHEDULE', '未知的日程来源', 400)
    if (input.provider === 'outlook' || input.provider === 'ics') {
      const url = text(input.url)
      if (url === '') throw new DeskError('INVALID_SCHEDULE', '请填写 ICS 订阅链接', 400)
      // The Outlook published-link channel keeps the Microsoft-only host whitelist; the generic
      // subscription channel accepts any public https host (checked per redirect hop in the adapter).
      const hostPolicy = input.provider === 'outlook' ? 'outlook' : 'public'
      const result = await fetchOutlookIcs(url, { timeoutMs: SCHEDULE_REQUEST_TIMEOUT_MS, hostPolicy })
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
    const { homeUrl } = await discoverCalDav(baseUrl, { user: account, password }, adapterDeps())
    const calendars = await listCalDavCalendars(homeUrl, { user: account, password }, adapterDeps())
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
    const service = requireCredentials(this.ctx)

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
    if (source !== undefined) await this.deps.syncSource(source).catch(() => undefined)
    return this.deps.state()
  }

  /** Remove one connection plus its calendars and mirrored events (local only; remote untouched). */
  async removeConnection(provider: unknown): Promise<ScheduleStateResponse> {
    if (!isProvider(provider)) throw new DeskError('INVALID_SCHEDULE', '未知的日程来源', 400)
    const channel = PROVIDER_CHANNEL[provider]
    const source = this.store.findScheduleSource(provider, channel)
    const service = credentialsOf(this.ctx)
    if (service !== undefined) await service.unset(CREDENTIAL_REF[provider]).catch(() => undefined)
    if (source !== undefined) await this.store.removeScheduleSource(source.id)
    return this.deps.state()
  }

  /** Add one provider-agnostic ICS subscription (each subscription is its own source). */
  async addSubscription(input: ScheduleSubscriptionInput): Promise<ScheduleStateResponse> {
    const url = text(input.url)
    if (url === '') throw new DeskError('INVALID_SCHEDULE', '请填写 ICS 订阅链接', 400)
    // Validate before persisting the URL in the credential store. A subscription is provider-agnostic
    // (any public https feed), not an Outlook published link.
    const fetched = await fetchOutlookIcs(url, { timeoutMs: SCHEDULE_REQUEST_TIMEOUT_MS, hostPolicy: 'public' })
    if (fetched.ics === undefined) throw new DeskError('SCHEDULE_UNAVAILABLE', '这个链接没有返回日历内容', 400)
    const name = text(input.name)
    const credentialRef = `DESK_ONE_ICS_URL_${randomUUID()}`
    const service = requireCredentials(this.ctx)
    // Persist the secret before the source row: a source without its credential would show up in
    // the panel and fail every sync, while a leftover secret is invisible and is cleaned up below.
    await service.set(credentialRef, url)
    let source: DeskScheduleSource
    try {
      source = await this.store.createScheduleSource({
        provider: 'ics',
        channel: 'ics',
        account: name === '' ? new URL(url).hostname : name,
        credentialRef,
      })
    } catch (error) {
      await service.unset(credentialRef).catch(() => undefined)
      throw error
    }
    await this.deps.syncSource(source).catch(() => undefined)
    return this.deps.state()
  }

  /** Remove one subscription plus its mirrored calendar/events; remote content is untouched. */
  async removeSubscription(sourceId: unknown): Promise<ScheduleStateResponse> {
    const id = text(sourceId)
    const source = this.store.getScheduleSource(id)
    if (source === undefined || source.provider !== 'ics') {
      throw new DeskError('INVALID_SCHEDULE', '订阅不存在', 404)
    }
    const service = credentialsOf(this.ctx)
    if (service !== undefined && source.credentialRef !== undefined) {
      await service.unset(source.credentialRef).catch(() => undefined)
    }
    await this.store.removeScheduleSource(source.id)
    return this.deps.state()
  }

  /** Disconnect Outlook Graph: unset the refresh token, drop the token cache, remove the source. */
  async disconnectOutlookGraph(): Promise<ScheduleStateResponse> {
    const source = this.store.findScheduleSource('outlook', 'graph')
    const service = credentialsOf(this.ctx)
    if (service !== undefined) await service.unset(OUTLOOK_GRAPH_REFRESH_REF).catch(() => undefined)
    this.deps.clearGraphAccess()
    if (source !== undefined) await this.store.removeScheduleSource(source.id)
    return this.deps.state()
  }
}
