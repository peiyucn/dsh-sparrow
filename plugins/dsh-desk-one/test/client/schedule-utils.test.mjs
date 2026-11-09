// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  addDays, conflictIds, dayKey, formatDayTitle, groupByDay, keyOfEvent, listRange, monthRange,
  startOfLocalDay, weekBlocks, weekRange,
} from '../../lib/client/schedule/utils.js'

const event = (id, start, end, over = {}) => ({
  id, title: id, start, end, allDay: false, busy: true, provider: 'wecom', channel: 'caldav',
  calendarNodeId: 'cal-1', calendarRemoteId: '/c/1/', externalId: id, uid: id, timezone: 'Asia/Shanghai', revision: 1,
  createdAt: '', updatedAt: '', ...over,
})

describe('client schedule utils', () => {
  it('monthRange 覆盖完整周（周日起始）', () => {
    const { from, to } = monthRange(new Date(2026, 10, 15)) // 2026-11
    assert.equal(from.getDay(), 0, '从周日开始')
    assert.equal(to.getDay(), 0, '到下一周的周日（排他）')
    assert.ok(from <= new Date(2026, 10, 1))
    assert.ok(to > new Date(2026, 10, 30))
  })

  it('weekRange / listRange 起点是本地零点（周日起始）', () => {
    const { from, to } = weekRange(new Date(2026, 10, 11, 15, 30)) // 周三
    assert.equal(from.getDay(), 0)
    assert.equal(from.getHours(), 0)
    assert.equal((to.getTime() - from.getTime()) / 86_400_000, 7)
    const list = listRange(new Date(2026, 10, 11, 15), 30)
    assert.equal(list.from.getHours(), 0)
    assert.equal((list.to.getTime() - list.from.getTime()) / 86_400_000, 30)
  })

  it('keyOfEvent：全天按 UTC 日期，定时事件按本地日期', () => {
    const allDay = event('a', '2026-11-08T00:00:00.000Z', '2026-11-09T00:00:00.000Z', { allDay: true })
    assert.equal(keyOfEvent(allDay), '2026-11-08')
    const local = new Date(2026, 10, 9, 10, 0)
    const timed = event('b', local.toISOString(), new Date(local.getTime() + 3_600_000).toISOString())
    assert.equal(keyOfEvent(timed), dayKey(local))
  })

  it('groupByDay 生成固定天数并只把事件放进本地日期那天', () => {
    const from = new Date(2026, 10, 9)
    const first = event('a', new Date(2026, 10, 9, 9).toISOString(), new Date(2026, 10, 9, 10).toISOString())
    const third = event('b', new Date(2026, 10, 11, 9).toISOString(), new Date(2026, 10, 11, 10).toISOString())
    const groups = /** @type {any[]} */ (groupByDay([third, first], from, 5))
    assert.equal(groups.length, 5)
    assert.deepEqual(groups[0]?.events.map(e => e.id), ['a'])
    assert.deepEqual(groups[2]?.events.map(e => e.id), ['b'])
    assert.equal(groups[1]?.events.length, 0)
  })

  it('conflictIds 只标记同一天、busy、有重叠的定时事件', () => {
    const day = new Date(2026, 10, 9)
    const a = event('a', new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9).toISOString(), new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10).toISOString())
    const b = event('b', new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 30).toISOString(), new Date(day.getFullYear(), day.getMonth(), day.getDate(), 11).toISOString())
    const free = event('c', new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9).toISOString(), new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10).toISOString(), { busy: false })
    const nextDay = event('d', new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 9).toISOString(), new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 10).toISOString())
    assert.deepEqual([...conflictIds([a, b, free, nextDay])].sort(), ['a', 'b'])
  })

  it('weekBlocks 把重叠事件分到不同 lane，并按小时定位', () => {
    const day = new Date(2026, 10, 9) // 周一
    const a = event('a', new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9).toISOString(), new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10).toISOString())
    const b = event('b', new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9).toISOString(), new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10).toISOString())
    const blocks = weekBlocks([a, b], day)
    assert.equal(blocks.length, 2)
    assert.equal(blocks[0]?.dayIndex, 0)
    assert.equal(new Set(blocks.map(block => block.lane)).size, 2)
    assert.equal(blocks[0]?.lanes, 2)
    assert.ok((blocks[0]?.topPct ?? 0) > 0)
  })

  it('formatDayTitle 的今天/明天使用传入文案，其它日期本地化', () => {
    const today = startOfLocalDay(new Date(2026, 10, 9))
    assert.equal(formatDayTitle(today, today, { today: '今天', tomorrow: '明天' }, value => `F${value.getDate()}`), '今天')
    assert.equal(formatDayTitle(addDays(today, 1), today, { today: '今天', tomorrow: '明天' }, value => `F${value.getDate()}`), '明天')
    assert.notEqual(formatDayTitle(addDays(today, 2), today, { today: '今天', tomorrow: '明天' }, value => `F${value.getDate()}`), '今天')
  })
})
