/** Schedule REST table (S2): read-only events, calendar source metadata and connection management. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  ROUTES, SCHEDULE_PROVIDERS, type ScheduleProvider,
} from '../../constants.js'
import type {
  OutlookLoginPollResponse, OutlookLoginStartResponse, ScheduleCalendarUpdateRequest, ScheduleConnectionInput,
  ScheduleConnectionTestResponse,
  ScheduleEventListResponse, ScheduleStateResponse, ScheduleSubscriptionInput, ScheduleSyncResponse,
} from '../../contract.js'
import { DeskError, bodyObject, readJsonBody, sendJson } from '../http.js'
import type { DeskRouteEntry } from '../router.js'
import type { DeskRouteContext } from '../router.js'

function scheduleOf(route: DeskRouteContext) {
  if (route.schedule === undefined) {
    throw new DeskError('SCHEDULE_UNAVAILABLE', '日程模块未启用', 503)
  }
  return route.schedule
}

function queryOf(req: IncomingMessage): URLSearchParams {
  return new URL(req.url ?? '/', 'http://localhost').searchParams
}

function providerOf(value: string | null): ScheduleProvider | undefined {
  if (value === null || value === '') return undefined
  if (!(SCHEDULE_PROVIDERS as readonly string[]).includes(value)) {
    throw new DeskError('INVALID_SCHEDULE', `未知的日程来源：${value}`, 400)
  }
  return value as ScheduleProvider
}

function calendarIdsOf(value: string | null): string[] | undefined {
  if (value === null || value.trim() === '') return undefined
  return value.split(',').map(item => item.trim()).filter(item => item !== '')
}

async function getEvents(route: DeskRouteContext, req: IncomingMessage): Promise<ScheduleEventListResponse> {
  const params = queryOf(req)
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  return scheduleOf(route).events(from, to, calendarIdsOf(params.get('calendar_ids')), providerOf(params.get('provider')))
}

async function getCalendars(route: DeskRouteContext): Promise<ScheduleStateResponse> {
  return scheduleOf(route).state()
}

async function updateCalendar(route: DeskRouteContext, req: IncomingMessage): Promise<ScheduleStateResponse> {
  const body = bodyObject<Partial<ScheduleCalendarUpdateRequest> & Partial<{ id: unknown; expectedRevision: unknown; patch: unknown }>>(
    await readJsonBody(req),
    '日历更新请求必须是 JSON 对象',
  )
  if (typeof body.id !== 'string' || body.id === '') throw new DeskError('INVALID_SCHEDULE', '缺少日历 id', 400)
  if (typeof body.expectedRevision !== 'number' || !Number.isInteger(body.expectedRevision)) {
    throw new DeskError('INVALID_SCHEDULE', '缺少 expectedRevision', 400)
  }
  const patch = body.patch as { color?: unknown; enabled?: unknown; order?: unknown } | undefined
  if (patch === undefined || typeof patch !== 'object' || patch === null) {
    throw new DeskError('INVALID_SCHEDULE', '缺少 patch', 400)
  }
  const schedule = scheduleOf(route)
  const updated = await route.store.updateCalendar(body.id, body.expectedRevision, patch)
  // Turning per-calendar sync off also drops its mirrored events, so stale/leftover calendars
  // stop contributing data immediately instead of lingering until the next full sync.
  if (patch.enabled === false) await route.store.syncCalendarEvents(updated, [])
  return schedule.state()
}

async function sync(route: DeskRouteContext): Promise<ScheduleSyncResponse> {
  return scheduleOf(route).sync()
}

async function saveConnection(route: DeskRouteContext, req: IncomingMessage): Promise<ScheduleStateResponse> {
  const body = bodyObject<ScheduleConnectionInput>(await readJsonBody(req), '连接请求必须是 JSON 对象')
  return scheduleOf(route).saveConnection(body)
}

async function testConnection(route: DeskRouteContext, req: IncomingMessage): Promise<ScheduleConnectionTestResponse> {
  const body = bodyObject<ScheduleConnectionInput>(await readJsonBody(req), '测试请求必须是 JSON 对象')
  return scheduleOf(route).test(body)
}

async function removeConnection(route: DeskRouteContext, req: IncomingMessage): Promise<ScheduleStateResponse> {
  const body = bodyObject<{ readonly provider?: unknown }>(await readJsonBody(req), '断开请求必须是 JSON 对象')
  return scheduleOf(route).removeConnection(body.provider)
}

async function startOutlookLogin(route: DeskRouteContext, req: IncomingMessage): Promise<OutlookLoginStartResponse> {
  const body = bodyObject<{ readonly redirectUri?: unknown }>(await readJsonBody(req), '登录请求必须是 JSON 对象')
  return scheduleOf(route).startOutlookLogin(typeof body.redirectUri === 'string' ? body.redirectUri : undefined)
}

async function outlookCallback(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const params = new URL(req.url ?? '/', 'http://localhost').searchParams
  const result = params.get('error') === null
    ? await scheduleOf(route).completeOutlookLogin(params.get('code') ?? '', params.get('state') ?? '')
    : { ok: false, message: params.get('error_description') ?? params.get('error') ?? 'Microsoft 拒绝了登录' }
  const title = result.ok ? 'Outlook 已连接' : 'Outlook 连接失败'
  res.writeHead(result.ok ? 200 : 400, { 'content-type': 'text/html; charset=utf-8' })
  res.end(`<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:system-ui;padding:32px"><h2>${title}</h2><p>${result.message}</p><script>if(window.opener){window.opener.postMessage({type:'desk-one-outlook',ok:${result.ok}},'*')}</script></body>`)
}

async function pollOutlookLogin(route: DeskRouteContext, req: IncomingMessage): Promise<OutlookLoginPollResponse> {
  const body = bodyObject<{ readonly flowId?: unknown }>(await readJsonBody(req), '登录轮询请求必须是 JSON 对象')
  return scheduleOf(route).pollOutlookLogin(body.flowId)
}

async function disconnectOutlook(route: DeskRouteContext): Promise<ScheduleStateResponse> {
  return scheduleOf(route).disconnectOutlookGraph()
}

async function addSubscription(route: DeskRouteContext, req: IncomingMessage): Promise<ScheduleStateResponse> {
  const body = bodyObject<ScheduleSubscriptionInput>(await readJsonBody(req), '订阅请求必须是 JSON 对象')
  return scheduleOf(route).addSubscription(body)
}

async function removeSubscription(route: DeskRouteContext, req: IncomingMessage): Promise<ScheduleStateResponse> {
  const body = bodyObject<{ readonly id?: unknown }>(await readJsonBody(req), '取消订阅请求必须是 JSON 对象')
  return scheduleOf(route).removeSubscription(body.id)
}

/** Route table appended to the desk router; the trust fence and error mapping stay in router.ts. */
export const SCHEDULE_ROUTES: readonly DeskRouteEntry[] = [
  { method: 'GET', path: ROUTES.scheduleEvents, handle: (route, req, res) => reply(res, getEvents(route, req)) },
  { method: 'GET', path: ROUTES.scheduleCalendars, handle: (route, _req, res) => reply(res, getCalendars(route)) },
  { method: 'GET', path: ROUTES.scheduleStatus, handle: (route, _req, res) => reply(res, getCalendars(route)) },
  { method: 'POST', path: ROUTES.scheduleCalendarUpdate, handle: (route, req, res) => reply(res, updateCalendar(route, req)) },
  { method: 'POST', path: ROUTES.scheduleSync, handle: (route, _req, res) => reply(res, sync(route)) },
  { method: 'POST', path: ROUTES.scheduleConnectionSave, handle: (route, req, res) => reply(res, saveConnection(route, req)) },
  { method: 'POST', path: ROUTES.scheduleConnectionTest, handle: (route, req, res) => reply(res, testConnection(route, req)) },
  { method: 'POST', path: ROUTES.scheduleConnectionRemove, handle: (route, req, res) => reply(res, removeConnection(route, req)) },
  { method: 'POST', path: ROUTES.scheduleSubscriptionAdd, handle: (route, req, res) => reply(res, addSubscription(route, req)) },
  { method: 'POST', path: ROUTES.scheduleSubscriptionRemove, handle: (route, req, res) => reply(res, removeSubscription(route, req)) },
  { method: 'POST', path: ROUTES.scheduleOutlookLoginStart, handle: (route, req, res) => reply(res, startOutlookLogin(route, req)) },
  { method: 'GET', path: ROUTES.scheduleOutlookCallback, handle: (route, req, res) => outlookCallback(route, req, res) },
  { method: 'POST', path: ROUTES.scheduleOutlookLoginPoll, handle: (route, req, res) => reply(res, pollOutlookLogin(route, req)) },
  { method: 'POST', path: ROUTES.scheduleOutlookDisconnect, handle: (route, _req, res) => reply(res, disconnectOutlook(route)) },
]

async function reply<T>(res: ServerResponse, task: Promise<T>): Promise<void> {
  sendJson(res, 200, await task)
}
