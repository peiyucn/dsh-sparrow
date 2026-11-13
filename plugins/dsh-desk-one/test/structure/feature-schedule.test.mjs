// @ts-check
/**
 * Schedule feature contract: read-only aggregation of the four providers, the schedule REST surface
 * (connections / subscriptions / Outlook OAuth), the agent tools, and the client data facade.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DESK_DOMAIN } from '../../lib/domain.js'
import { PREFIX, ROUTES, SCHEDULE_CHANNELS, SCHEDULE_COLORS, SCHEDULE_PROVIDERS } from '../../lib/constants.js'
import { SCHEDULE_ROUTES } from '../../lib/host/schedule/routes.js'
import { registerScheduleTools } from '../../lib/host/schedule/tools.js'
import * as scheduleApi from '../../lib/client/schedule/api.js'
import { collectToolNames } from './helpers.mjs'

/** Node schema of the unified `nodes` table (validated per record). */
const nodeSchema = /** @type {any} */ (DESK_DOMAIN.tables.nodes.valueSchema)
const STAMP = '2026-01-01T00:00:00.000Z'
/** Unknown kind probe: `kind` is the discriminant under test. */
const NODE_UNKNOWN = { id: 'x', kind: 'not-a-kind', schema: 1, revision: 1 }

/**
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function sourceRecord(overrides) {
  return {
    id: 'source_1',
    kind: 'schedule-source',
    schema: 1,
    provider: 'wecom',
    channel: 'caldav',
    enabled: true,
    syncState: 'idle',
    createdAt: STAMP,
    updatedAt: STAMP,
    revision: 1,
    ...overrides,
  }
}

/**
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function calendarRecord(overrides) {
  return {
    id: 'calendar_1',
    kind: 'calendar',
    schema: 1,
    sourceId: 'source_1',
    provider: 'ics',
    channel: 'ics',
    remoteId: 'remote_1',
    displayName: 'Calendar',
    color: SCHEDULE_COLORS[0],
    order: 0,
    enabled: true,
    readOnly: true,
    createdAt: STAMP,
    updatedAt: STAMP,
    revision: 1,
    ...overrides,
  }
}

/**
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function eventRecord(overrides) {
  return {
    id: 'event_1',
    kind: 'event',
    schema: 1,
    calendarNodeId: 'calendar_1',
    provider: 'ics',
    channel: 'ics',
    calendarRemoteId: 'remote_1',
    externalId: 'external_1',
    uid: 'uid_1',
    title: 'Event',
    start: STAMP,
    end: STAMP,
    allDay: false,
    timezone: 'UTC',
    busy: true,
    createdAt: STAMP,
    updatedAt: STAMP,
    revision: 1,
    ...overrides,
  }
}

describe('日程契约', () => {
  it('四类日程源只读聚合，镜像记录可解析且日历强制只读', () => {
    assert.deepEqual([...SCHEDULE_PROVIDERS], ['wecom', 'icloud', 'outlook', 'ics'], 'v1 聚合四类日程源')
    assert.deepEqual([...SCHEDULE_CHANNELS], ['caldav', 'ics', 'graph'], '同一 provider 的三种接入通道')
    assert.equal(nodeSchema.safeParse(sourceRecord()).success, true)
    assert.equal(nodeSchema.safeParse(calendarRecord()).success, true)
    assert.equal(nodeSchema.safeParse(eventRecord()).success, true)
    assert.equal(nodeSchema.safeParse(calendarRecord({ readOnly: false })).success, false, '镜像日历必须只读')
    assert.equal(nodeSchema.safeParse(eventRecord({ busy: undefined })).success, false, '事件必须有 busy 标记')
    assert.equal(nodeSchema.safeParse(NODE_UNKNOWN).success, false, '未知 kind 必须被拒绝')
  })

  it('日程 REST 路由应该全部挂在统一前缀下，覆盖同步 / 连接 / 订阅 / Outlook 回调', () => {
    const routes = SCHEDULE_ROUTES
    const paths = routes.map(route => route.path)
    assert.deepEqual(paths.filter(path => !path.startsWith(`${PREFIX}/`)), [], '所有路由必须在 /api/desk-one 前缀下')
    for (const required of [
      ROUTES.scheduleEvents,
      ROUTES.scheduleCalendars,
      ROUTES.scheduleCalendarUpdate,
      ROUTES.scheduleStatus,
      ROUTES.scheduleSync,
      ROUTES.scheduleConnectionSave,
      ROUTES.scheduleConnectionTest,
      ROUTES.scheduleConnectionRemove,
      ROUTES.scheduleSubscriptionAdd,
      ROUTES.scheduleSubscriptionRemove,
      ROUTES.scheduleOutlookLoginStart,
      ROUTES.scheduleOutlookLoginPoll,
      ROUTES.scheduleOutlookDisconnect,
      ROUTES.scheduleOutlookCallback,
    ]) {
      assert.ok(paths.includes(required), `日程路由缺 ${required}`)
    }
    const callback = routes.find(route => route.path === ROUTES.scheduleOutlookCallback)
    assert.equal(callback?.method, 'GET', 'OAuth 回调是浏览器顶层跳转，必须是 GET')
    const keys = routes.map(route => `${route.method} ${route.path}`)
    assert.equal(new Set(keys).size, keys.length, '路由表不得有重复的 method + path')
  })

  it('日程 agent 工具应该齐全（查询 / 显式同步 / 连接状态）', () => {
    assert.deepEqual(collectToolNames(registerScheduleTools, {}), [
      'desk_schedule_connections',
      'desk_schedule_list',
      'desk_schedule_sync',
    ])
  })

  it('客户端日程数据面应该暴露同步 / 连接 / 订阅 / Outlook 登录动作', () => {
    for (const action of [
      'loadState',
      'loadEvents',
      'updateCalendar',
      'sync',
      'testConnection',
      'saveConnection',
      'removeConnection',
      'addSubscription',
      'removeSubscription',
      'startOutlookLogin',
      'pollOutlookLogin',
      'disconnectOutlook',
    ]) {
      assert.equal(typeof scheduleApi[action], 'function', `客户端日程 API 缺 ${action}`)
    }
  })
})
