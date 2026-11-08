// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  colorForOrder, createCalendarRecord, createEventRecord, createScheduleSourceRecord, eventMatchesDraft,
  filterEvents, scheduleErrorOf, sortEvents,
} from '../../../lib/host/schedule/records.js'

const now = '2026-11-09T00:00:00.000Z'

const draft = (over = {}) => ({
  externalId: 'evt-1',
  uid: 'evt-1',
  title: '周会',
  start: '2026-11-09T01:00:00.000Z',
  end: '2026-11-09T02:00:00.000Z',
  allDay: false,
  timezone: 'Asia/Shanghai',
  busy: true,
  ...over,
})

describe('schedule records', () => {
  it('colorForOrder 在色板内循环且负数安全', () => {
    assert.equal(colorForOrder(0), colorForOrder(8))
    assert.equal(colorForOrder(1), colorForOrder(9))
    assert.notEqual(colorForOrder(0), colorForOrder(1))
    assert.ok(colorForOrder(-1).startsWith('#'))
  })

  it('createScheduleSourceRecord 不携带任何密码，只存凭据引用名', () => {
    const source = createScheduleSourceRecord(
      { provider: 'wecom', channel: 'caldav', account: 'alice@example.test', credentialRef: 'DESK_ONE_WECOM' },
      { now },
    )
    assert.equal(source.kind, 'schedule-source')
    assert.equal(source.syncState, 'idle')
    assert.equal(source.credentialRef, 'DESK_ONE_WECOM')
    assert.ok(!JSON.stringify(source).includes('password'))
  })

  it('createCalendarRecord 自动分配颜色并可被用户覆盖', () => {
    const calendar = createCalendarRecord({
      sourceId: 'source-1', provider: 'wecom', channel: 'caldav', remoteId: '/calendar/1/', displayName: '', order: 0,
    }, { now })
    assert.equal(calendar.kind, 'calendar')
    assert.equal(calendar.readOnly, true)
    assert.equal(calendar.color, colorForOrder(0))
    assert.equal(calendar.displayName, '/calendar/1/', '空 displayName 回退 remoteId')
  })

  it('createEventRecord 保留实例键与 RRULE，省略未提供的可选字段', () => {
    const calendar = { id: 'cal-1' }
    const event = createEventRecord(draft({ recurrenceId: '20261109T010000Z', rrule: 'RRULE:FREQ=WEEKLY' }), {
      calendarNodeId: calendar.id,
      provider: 'wecom',
      channel: 'caldav',
      calendarRemoteId: '/calendar/1/',
      now,
    })
    assert.equal(event.kind, 'event')
    assert.equal(event.externalId, 'evt-1')
    assert.equal(event.recurrenceId, '20261109T010000Z')
    assert.equal(event.rrule, 'RRULE:FREQ=WEEKLY')
    assert.ok(!('description' in event))
    assert.equal(event.revision, 1)
  })

  it('filterEvents 用半开区间相交，并按 start 排序；可选日历过滤', () => {
    const base = { calendarNodeId: 'cal-1', provider: 'wecom', channel: 'caldav', calendarRemoteId: '/c/1/', now }
    const first = createEventRecord(draft({ externalId: 'a', uid: 'a', start: '2026-11-09T01:00:00.000Z', end: '2026-11-09T02:00:00.000Z' }), base)
    const second = createEventRecord(draft({ externalId: 'b', uid: 'b', start: '2026-11-09T02:00:00.000Z', end: '2026-11-09T03:00:00.000Z' }), base)
    const other = createEventRecord(draft({ externalId: 'c', uid: 'c', start: '2026-11-09T01:30:00.000Z', end: '2026-11-09T02:30:00.000Z' }), { ...base, calendarNodeId: 'cal-2' })

    const window = { from: '2026-11-09T01:00:00.000Z', to: '2026-11-09T02:00:00.000Z' }
    assert.deepEqual(sortEvents([second, first]).map(e => e.externalId), ['a', 'b'])
    assert.deepEqual(filterEvents([first, second, other], window).map(e => e.externalId), ['a', 'c'], '结束时刻等于 from 的事件不算相交；另一日历的事件也相交')
    assert.deepEqual(filterEvents([first, second, other], { ...window, calendarIds: ['cal-1'] }).map(e => e.externalId), ['a'])
    assert.deepEqual(filterEvents([first, second, other], { ...window, provider: 'icloud' }), [])
  })

  it('eventMatchesDraft 用于跳过无变化的写入', () => {
    const event = createEventRecord(draft(), {
      calendarNodeId: 'cal-1', provider: 'wecom', channel: 'caldav', calendarRemoteId: '/c/1/', now,
    })
    assert.equal(eventMatchesDraft(event, draft()), true)
    assert.equal(eventMatchesDraft(event, draft({ title: '改名' })), false)
    assert.equal(eventMatchesDraft(event, draft({ end: '2026-11-09T02:30:00.000Z' })), false)
  })

  it('scheduleErrorOf 产出可展示的错误且不包含凭据', () => {
    const error = Object.assign(new Error('连接失败'), { code: 'SCHEDULE_AUTH_EXPIRED' })
    const mapped = scheduleErrorOf(error)
    assert.equal(mapped.code, 'SCHEDULE_AUTH_EXPIRED')
    assert.equal(mapped.message, '连接失败')
    assert.match(mapped.at, /^\d{4}-\d{2}-\d{2}T/u)
    assert.ok(!JSON.stringify(mapped).toLowerCase().includes('password'))
  })
})
