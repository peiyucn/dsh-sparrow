/**
 * Outlook personal calendars over Microsoft Graph (OAuth device code, no published ICS link).
 * The refresh token is the only stored secret; access tokens stay in memory and are refreshed on
 * demand. Events are requested with `Prefer: outlook.timezone="UTC"` so Graph returns UTC stamps.
 */

import {
  OUTLOOK_GRAPH_CLIENT_ID, OUTLOOK_GRAPH_SCOPE, OUTLOOK_GRAPH_TENANT, SCHEDULE_REQUEST_TIMEOUT_MS,
} from '../../../constants.js'
import { ScheduleError } from '../types.js'
import type { EventDraft } from '../records.js'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const MAX_PAGES = 10

export interface GraphDeviceCode {
  readonly deviceCode: string
  readonly userCode: string
  readonly verificationUri: string
  readonly expiresIn: number
  readonly interval: number
}

export interface GraphTokens {
  readonly accessToken: string
  readonly refreshToken?: string
  readonly expiresIn: number
}

export interface GraphCalendar {
  readonly id: string
  readonly name: string
}

interface GraphEvent {
  readonly id: string
  readonly iCalUId?: string
  readonly subject?: string
  readonly bodyPreview?: string
  readonly location?: { readonly displayName?: string }
  readonly start?: { readonly dateTime?: string; readonly timeZone?: string }
  readonly end?: { readonly dateTime?: string; readonly timeZone?: string }
  readonly isAllDay?: boolean
  readonly showAs?: string
  readonly webLink?: string
  readonly isCancelled?: boolean
}

export interface GraphEventPage {
  readonly value?: readonly GraphEvent[]
  readonly '@odata.nextLink'?: string
}

export interface GraphDeps {
  readonly fetchImpl?: typeof fetch
  readonly timeoutMs?: number
}

function tokenUrl(path: string): string {
  return `https://login.microsoftonline.com/${OUTLOOK_GRAPH_TENANT}/oauth2/v2.0/${path}`
}

async function requestJson<T>(url: string, init: RequestInit, deps: GraphDeps, what: string): Promise<T> {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') throw new ScheduleError('UNSUPPORTED', '当前运行环境缺少 fetch，无法访问 Microsoft Graph')
  let response: Response
  try {
    response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(deps.timeoutMs ?? SCHEDULE_REQUEST_TIMEOUT_MS) })
  } catch (error) {
    throw new ScheduleError('TRANSIENT', `${what}请求失败：${error instanceof Error ? error.message : String(error)}`)
  }
  const text = await response.text()
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw new ScheduleError('TRANSIENT', `${what}返回了非 JSON 响应`)
  }
  if (!response.ok) {
    const record = payload as { error?: unknown; error_description?: unknown }
    const code = typeof record.error === 'string' ? record.error : `HTTP ${response.status}`
    const detail = typeof record.error_description === 'string' ? record.error_description : ''
    if (code === 'authorization_pending' || code === 'slow_down') {
      throw new ScheduleError('TRANSIENT', `${what}还在等待授权`)
    }
    if (code === 'expired_token' || code === 'code_expired') {
      throw new ScheduleError('AUTH_EXPIRED', '设备码已过期，请重新发起登录', 'SCHEDULE_AUTH_EXPIRED')
    }
    if (code === 'authorization_declined' || code === 'invalid_grant') {
      throw new ScheduleError('AUTH_EXPIRED', 'Microsoft 授权被拒绝或已失效，请重新登录', 'SCHEDULE_AUTH_EXPIRED')
    }
    throw new ScheduleError('AUTH_EXPIRED', `${what}失败：${code}${detail === '' ? '' : `（${detail.slice(0, 180)}）`}`, 'SCHEDULE_AUTH_EXPIRED')
  }
  return payload as T
}

function formBody(values: Record<string, string>): URLSearchParams {
  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) body.set(key, value)
  return body
}

export async function startGraphDeviceCode(deps: GraphDeps = {}): Promise<GraphDeviceCode> {
  const payload = await requestJson<{
    device_code: string
    user_code: string
    verification_uri: string
    expires_in: number
    interval?: number
  }>(tokenUrl('devicecode'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({ client_id: OUTLOOK_GRAPH_CLIENT_ID, scope: OUTLOOK_GRAPH_SCOPE }).toString(),
  }, deps, 'Microsoft 设备码')
  return {
    deviceCode: payload.device_code,
    userCode: payload.user_code,
    verificationUri: payload.verification_uri,
    expiresIn: payload.expires_in,
    interval: payload.interval ?? 5,
  }
}

export async function pollGraphDeviceCode(deviceCode: string, deps: GraphDeps = {}): Promise<GraphTokens | null> {
  const payload = await requestJson<{
    access_token?: string
    refresh_token?: string
    expires_in?: number
    error?: string
  }>(tokenUrl('token'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: OUTLOOK_GRAPH_CLIENT_ID,
      device_code: deviceCode,
    }).toString(),
  }, deps, 'Microsoft 登录轮询')
  if (payload.access_token === undefined) throw new ScheduleError('TRANSIENT', 'Microsoft 登录未返回 access token')
  return {
    accessToken: payload.access_token,
    ...(payload.refresh_token === undefined ? {} : { refreshToken: payload.refresh_token }),
    expiresIn: payload.expires_in ?? 3600,
  }
}

export async function refreshGraphToken(refreshToken: string, deps: GraphDeps = {}): Promise<GraphTokens> {
  const payload = await requestJson<{
    access_token: string
    refresh_token?: string
    expires_in?: number
  }>(tokenUrl('token'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      grant_type: 'refresh_token',
      client_id: OUTLOOK_GRAPH_CLIENT_ID,
      refresh_token: refreshToken,
      scope: OUTLOOK_GRAPH_SCOPE,
    }).toString(),
  }, deps, 'Microsoft 刷新令牌')
  return {
    accessToken: payload.access_token,
    ...(payload.refresh_token === undefined ? {} : { refreshToken: payload.refresh_token }),
    expiresIn: payload.expires_in ?? 3600,
  }
}

async function graphGet<T>(accessToken: string, url: string, deps: GraphDeps, what: string): Promise<T> {
  return requestJson<T>(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`,
      prefer: 'outlook.timezone="UTC"',
    },
  }, deps, what)
}

export async function listGraphCalendars(accessToken: string, deps: GraphDeps = {}): Promise<GraphCalendar[]> {
  const cal = await graphGet<{ value?: readonly { id?: string; name?: string }[] }>(
    accessToken,
    `${GRAPH_BASE}/me/calendars?$select=id,name&$top=100`,
    deps,
    'Graph 列日历',
  )
  return (cal.value ?? [])
    .filter((item): item is { id: string; name?: string } => typeof item.id === 'string' && item.id !== '')
    .map(item => ({ id: item.id, name: item.name ?? item.id }))
}

/** Graph UTC stamp (`2026-11-09T10:00:00.0000000`) -> ISO UTC. */
function isoOf(graph: { dateTime?: string; timeZone?: string } | undefined): string | undefined {
  if (graph?.dateTime === undefined || graph.dateTime === '') return undefined
  const normalized = graph.dateTime.replace(/\.\d+$/u, '')
  const parsed = new Date(`${normalized}Z`)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

export function graphEventDraft(event: GraphEvent): EventDraft | undefined {
  if (event.isCancelled === true) return undefined
  const start = isoOf(event.start)
  const end = isoOf(event.end)
  if (start === undefined || end === undefined) return undefined
  const externalId = event.iCalUId ?? event.id
  return {
    externalId,
    uid: externalId,
    title: event.subject?.trim() ?? '',
    ...(event.bodyPreview === undefined ? {} : { description: event.bodyPreview }),
    ...(event.location?.displayName === undefined ? {} : { location: event.location.displayName }),
    start,
    end,
    allDay: event.isAllDay === true,
    timezone: 'UTC',
    busy: event.showAs !== 'free',
    ...(event.webLink === undefined ? {} : { url: event.webLink }),
  }
}

export async function fetchGraphCalendarEvents(
  accessToken: string,
  calendarId: string,
  window: { readonly startUtc: string; readonly endUtc: string },
  deps: GraphDeps = {},
): Promise<EventDraft[]> {
  const params = new URLSearchParams({
    startDateTime: window.startUtc,
    endDateTime: window.endUtc,
    $select: 'id,iCalUId,subject,bodyPreview,location,start,end,isAllDay,showAs,webLink,isCancelled',
    $top: '100',
  })
  let url: string | undefined = `${GRAPH_BASE}/me/calendars/${encodeURIComponent(calendarId)}/calendarView?${params.toString()}`
  const drafts: EventDraft[] = []
  for (let page = 0; page < MAX_PAGES && url !== undefined; page += 1) {
    const payload: GraphEventPage = await graphGet<GraphEventPage>(accessToken, url, deps, 'Graph 拉日历事件')
    for (const event of payload.value ?? []) {
      const draft = graphEventDraft(event)
      if (draft !== undefined) drafts.push(draft)
    }
    url = payload['@odata.nextLink']
  }
  return drafts
}
