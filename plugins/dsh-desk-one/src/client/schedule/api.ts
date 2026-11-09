/** Browser-side schedule data plane: host REST routes only (read-only mirror + connection CRUD). */

import {
  REQUEST_TIMEOUT_MS, ROUTES, SCHEDULE_SYNC_TIMEOUT_MS, SCHEDULE_TEST_TIMEOUT_MS,
} from '../../constants.js'
import type {
  ApiErrorPayload, OutlookLoginPollResponse, OutlookLoginStartResponse, ScheduleCalendarUpdateRequest, ScheduleConnectionInput,
  ScheduleConnectionTestResponse, ScheduleEventListResponse, ScheduleStateResponse, ScheduleSubscriptionInput, ScheduleSyncResponse,
} from '../../contract.js'

async function fetchJson<T>(path: string, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { ...init, signal: init?.signal ?? AbortSignal.timeout(timeoutMs) })
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error('请求超时：同步可能仍在后台继续，稍后点「同步」或重新打开日程查看')
    }
    throw error
  }
  const text = await response.text()
  let payload: T & Partial<ApiErrorPayload>
  try {
    payload = JSON.parse(text) as T & Partial<ApiErrorPayload>
  } catch {
    throw new Error(`请求失败（HTTP ${response.status}）：${text.slice(0, 160) || '响应不是 JSON'}`)
  }
  if (!response.ok) throw new Error(payload.error?.message ?? `请求失败（HTTP ${response.status}）`)
  return payload
}

function postJson<T>(path: string, body: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  return fetchJson<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }, timeoutMs)
}

export interface ScheduleApi {
  readonly loadState: () => Promise<ScheduleStateResponse>
  readonly loadEvents: (from: string, to: string, calendarIds?: readonly string[]) => Promise<ScheduleEventListResponse>
  readonly updateCalendar: (input: ScheduleCalendarUpdateRequest) => Promise<ScheduleStateResponse>
  readonly sync: () => Promise<ScheduleSyncResponse>
  readonly testConnection: (input: ScheduleConnectionInput) => Promise<ScheduleConnectionTestResponse>
  readonly saveConnection: (input: ScheduleConnectionInput) => Promise<ScheduleStateResponse>
  readonly removeConnection: (provider: string) => Promise<ScheduleStateResponse>
  readonly addSubscription: (input: ScheduleSubscriptionInput) => Promise<ScheduleStateResponse>
  readonly removeSubscription: (id: string) => Promise<ScheduleStateResponse>
  readonly startOutlookLogin: () => Promise<OutlookLoginStartResponse>
  readonly pollOutlookLogin: (flowId: string) => Promise<OutlookLoginPollResponse>
  readonly disconnectOutlook: () => Promise<ScheduleStateResponse>
}

export function loadState(): Promise<ScheduleStateResponse> {
  return fetchJson<ScheduleStateResponse>(ROUTES.scheduleCalendars)
}

export function loadEvents(from: string, to: string, calendarIds?: readonly string[]): Promise<ScheduleEventListResponse> {
  const params = new URLSearchParams({ from, to })
  if (calendarIds !== undefined && calendarIds.length > 0) params.set('calendar_ids', calendarIds.join(','))
  return fetchJson<ScheduleEventListResponse>(`${ROUTES.scheduleEvents}?${params.toString()}`)
}

export function updateCalendar(input: ScheduleCalendarUpdateRequest): Promise<ScheduleStateResponse> {
  return postJson<ScheduleStateResponse>(ROUTES.scheduleCalendarUpdate, input)
}

export function sync(): Promise<ScheduleSyncResponse> {
  return postJson<ScheduleSyncResponse>(ROUTES.scheduleSync, {}, SCHEDULE_SYNC_TIMEOUT_MS)
}

export function testConnection(input: ScheduleConnectionInput): Promise<ScheduleConnectionTestResponse> {
  return postJson<ScheduleConnectionTestResponse>(ROUTES.scheduleConnectionTest, input, SCHEDULE_TEST_TIMEOUT_MS)
}

export function saveConnection(input: ScheduleConnectionInput): Promise<ScheduleStateResponse> {
  return postJson<ScheduleStateResponse>(ROUTES.scheduleConnectionSave, input, SCHEDULE_SYNC_TIMEOUT_MS)
}

export function addSubscription(input: ScheduleSubscriptionInput): Promise<ScheduleStateResponse> {
  return postJson<ScheduleStateResponse>(ROUTES.scheduleSubscriptionAdd, input, SCHEDULE_SYNC_TIMEOUT_MS)
}

export function startOutlookLogin(): Promise<OutlookLoginStartResponse> {
  return postJson<OutlookLoginStartResponse>(ROUTES.scheduleOutlookLoginStart, {}, SCHEDULE_TEST_TIMEOUT_MS)
}

export function pollOutlookLogin(flowId: string): Promise<OutlookLoginPollResponse> {
  return postJson<OutlookLoginPollResponse>(ROUTES.scheduleOutlookLoginPoll, { flowId })
}

export function disconnectOutlook(): Promise<ScheduleStateResponse> {
  return postJson<ScheduleStateResponse>(ROUTES.scheduleOutlookDisconnect, {})
}

export function removeSubscription(id: string): Promise<ScheduleStateResponse> {
  return postJson<ScheduleStateResponse>(ROUTES.scheduleSubscriptionRemove, { id })
}

export function removeConnection(provider: string): Promise<ScheduleStateResponse> {
  return postJson<ScheduleStateResponse>(ROUTES.scheduleConnectionRemove, { provider })
}

/** Shared facade injected into the panel seat (keeps components free of fetch details). */
export const scheduleApi: ScheduleApi = {
  loadState, loadEvents, updateCalendar, sync, testConnection, saveConnection, removeConnection,
  addSubscription, removeSubscription, startOutlookLogin, pollOutlookLogin, disconnectOutlook,
}
