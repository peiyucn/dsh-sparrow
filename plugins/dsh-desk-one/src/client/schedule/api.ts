

import {
  REQUEST_TIMEOUT_MS, ROUTES, SCHEDULE_SYNC_TIMEOUT_MS, SCHEDULE_TEST_TIMEOUT_MS,
} from '../../constants.js'
import type {
  OutlookLoginPollResponse, OutlookLoginStartResponse, ScheduleCalendarUpdateRequest, ScheduleConnectionInput,
  ScheduleConnectionTestResponse, ScheduleEventListResponse, ScheduleStateResponse, ScheduleSubscriptionInput, ScheduleSyncResponse,
} from '../../contract.js'
import { fetchJson, postJson } from '../http.js'


const SCHEDULE_TIMEOUT_MESSAGE = '请求超时：同步可能仍在后台继续，稍后点「同步」或重新打开日程查看'


function fetchSchedule<T>(path: string): Promise<T> {
  return fetchJson<T>(path, undefined, { timeoutMessage: SCHEDULE_TIMEOUT_MESSAGE })
}


function postSchedule<T>(path: string, body: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  return postJson<T>(path, body, { timeoutMs, timeoutMessage: SCHEDULE_TIMEOUT_MESSAGE })
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
  readonly startOutlookLogin: (redirectUri?: string) => Promise<OutlookLoginStartResponse>
  readonly pollOutlookLogin: (flowId: string) => Promise<OutlookLoginPollResponse>
  readonly disconnectOutlook: () => Promise<ScheduleStateResponse>
}

export function loadState(): Promise<ScheduleStateResponse> {
  return fetchSchedule<ScheduleStateResponse>(ROUTES.scheduleCalendars)
}

export function loadEvents(from: string, to: string, calendarIds?: readonly string[]): Promise<ScheduleEventListResponse> {
  const params = new URLSearchParams({ from, to })
  if (calendarIds !== undefined && calendarIds.length > 0) params.set('calendar_ids', calendarIds.join(','))
  return fetchSchedule<ScheduleEventListResponse>(`${ROUTES.scheduleEvents}?${params.toString()}`)
}

export function updateCalendar(input: ScheduleCalendarUpdateRequest): Promise<ScheduleStateResponse> {
  return postSchedule<ScheduleStateResponse>(ROUTES.scheduleCalendarUpdate, input)
}

export function sync(): Promise<ScheduleSyncResponse> {
  return postSchedule<ScheduleSyncResponse>(ROUTES.scheduleSync, {}, SCHEDULE_SYNC_TIMEOUT_MS)
}

export function testConnection(input: ScheduleConnectionInput): Promise<ScheduleConnectionTestResponse> {
  return postSchedule<ScheduleConnectionTestResponse>(ROUTES.scheduleConnectionTest, input, SCHEDULE_TEST_TIMEOUT_MS)
}

export function saveConnection(input: ScheduleConnectionInput): Promise<ScheduleStateResponse> {
  return postSchedule<ScheduleStateResponse>(ROUTES.scheduleConnectionSave, input, SCHEDULE_SYNC_TIMEOUT_MS)
}

export function addSubscription(input: ScheduleSubscriptionInput): Promise<ScheduleStateResponse> {
  return postSchedule<ScheduleStateResponse>(ROUTES.scheduleSubscriptionAdd, input, SCHEDULE_SYNC_TIMEOUT_MS)
}

export function startOutlookLogin(redirectUri?: string): Promise<OutlookLoginStartResponse> {
  return postSchedule<OutlookLoginStartResponse>(ROUTES.scheduleOutlookLoginStart, { redirectUri }, SCHEDULE_TEST_TIMEOUT_MS)
}

export function pollOutlookLogin(flowId: string): Promise<OutlookLoginPollResponse> {
  return postSchedule<OutlookLoginPollResponse>(ROUTES.scheduleOutlookLoginPoll, { flowId })
}

export function disconnectOutlook(): Promise<ScheduleStateResponse> {
  return postSchedule<ScheduleStateResponse>(ROUTES.scheduleOutlookDisconnect, {})
}

export function removeSubscription(id: string): Promise<ScheduleStateResponse> {
  return postSchedule<ScheduleStateResponse>(ROUTES.scheduleSubscriptionRemove, { id })
}

export function removeConnection(provider: string): Promise<ScheduleStateResponse> {
  return postSchedule<ScheduleStateResponse>(ROUTES.scheduleConnectionRemove, { provider })
}


export const scheduleApi: ScheduleApi = {
  loadState, loadEvents, updateCalendar, sync, testConnection, saveConnection, removeConnection,
  addSubscription, removeSubscription, startOutlookLogin, pollOutlookLogin, disconnectOutlook,
}
