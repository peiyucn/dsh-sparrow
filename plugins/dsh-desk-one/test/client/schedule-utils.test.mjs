// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  addDays, conflictIds, coversDayKey, dayKey, eventDayKeys, formatDayTitle, groupByDay, isoWeekNumber, keyOfEvent,
  isMultiDay, listRange, monthRange, spanBars, startOfLocalDay, weekBlocks, weekRange,
} from '../../lib/client/schedule/utils.js'

const event = (id, start, end, over = {}) => ({
  id, title: id, start, end, allDay: false, busy: true, provider: 'wecom', channel: 'caldav',
  calendarNodeId: 'cal-1', calendarRemoteId: '/c/1/', externalId: id, uid: id, timezone: 'Asia/Shanghai', revision: 1,
  createdAt: '', updatedAt: '', ...over,
})

describe('client schedule utils', () => {
  it('monthRange 覆盖完整周（周一起始）', () => {
    const { from, to } = monthRange(new Date(2026, 10, 15)) // 2026-11
    assert.equal(from.getDay(), 1, '从周一开始')
    assert.equal(to.getDay(), 1, '到下一周的周一（排他）')
    assert.ok(from <= new Date(2026, 10, 1))
    assert.ok(to > new Date(2026, 10, 30))
  })

  it('weekRange / listRange 起点是本地零点（周一起始）', () => {
    const { from, to } = weekRange(new Date(2026, 10, 11, 15, 30)) // 周三
    assert.equal(from.getDay(), 1)
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

  it('eventDayKeys：跨天日程展开到它覆盖的每一天', () => {
    // 企微全天培训：DTO 里 DTEND 排他，24..28 表示 24/25/26/27 四天。
    const training = event('training', '2026-11-24T00:00:00.000Z', '2026-11-28T00:00:00.000Z', { allDay: true })
    assert.deepEqual(eventDayKeys(training), ['2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'])

    const single = event('single', '2026-11-24T00:00:00.000Z', '2026-11-25T00:00:00.000Z', { allDay: true })
    assert.deepEqual(eventDayKeys(single), ['2026-11-24'])

    // 定时事件跨午夜：两天都要出现。
    const midnight = event(
      'midnight',
      new Date(2026, 10, 24, 23, 0).toISOString(),
      new Date(2026, 10, 25, 1, 0).toISOString(),
    )
    assert.deepEqual(eventDayKeys(midnight), ['2026-11-24', '2026-11-25'])

    // 当天内的事件只落一天。
    const sameDay = event(
      'same',
      new Date(2026, 10, 24, 9, 0).toISOString(),
      new Date(2026, 10, 24, 10, 0).toISOString(),
    )
    assert.deepEqual(eventDayKeys(sameDay), ['2026-11-24'])

    // 结束不晚于开始（坏数据）只算开始那天，不抛错。
    const broken = event('broken', new Date(2026, 10, 24, 9, 0).toISOString(), new Date(2026, 10, 24, 9, 0).toISOString())
    assert.deepEqual(eventDayKeys(broken), ['2026-11-24'])
    assert.equal(coversDayKey(broken, '2026-11-24'), true)
    assert.equal(coversDayKey(broken, '2026-11-25'), false)
  })

  it('spanBars：跨天日程按周裁成连续条（单日不进条、跨界开口）', () => {
    const week = Array.from({ length: 7 }, (_, index) => addDays(new Date(2026, 10, 23), index)) // 11-23 .. 11-29
    const training = event('training', '2026-11-24T00:00:00.000Z', '2026-11-28T00:00:00.000Z', { allDay: true })
    const outside = event('outside', '2026-11-26T00:00:00.000Z', '2026-12-02T00:00:00.000Z', { allDay: true })
    const single = event('single', '2026-11-25T00:00:00.000Z', '2026-11-26T00:00:00.000Z', { allDay: true })

    const bars = spanBars([training, outside, single], week)
    assert.equal(bars.length, 2, '单日事件不进条')

    const train = bars.find(bar => bar.event.id === 'training')
    assert.deepEqual({ startIndex: train?.startIndex, span: train?.span }, { startIndex: 1, span: 4 })
    assert.equal(train?.continuesBefore, false, '在本周内开始')
    assert.equal(train?.continuesAfter, false, '在本周内结束')

    const tail = bars.find(bar => bar.event.id === 'outside')
    assert.deepEqual({ startIndex: tail?.startIndex, span: tail?.span }, { startIndex: 3, span: 4 })
    assert.equal(tail?.continuesAfter, true, '跨到下周要开口')

    assert.equal(isMultiDay(single), false)
    assert.equal(isMultiDay(training), true)
  })

  it('spanBars：跨周前后都开口，且按起始列、长度排序', () => {
    const week = Array.from({ length: 7 }, (_, index) => addDays(new Date(2026, 10, 23), index))
    const before = event('before', '2026-11-20T00:00:00.000Z', '2026-11-26T00:00:00.000Z', { allDay: true })
    const long = event('long', '2026-11-24T00:00:00.000Z', '2026-12-01T00:00:00.000Z', { allDay: true }) // DTEND 排他：覆盖到 11-30 才算跨界
    const short = event('short', '2026-11-24T00:00:00.000Z', '2026-11-26T00:00:00.000Z', { allDay: true })
    const bars = spanBars([short, long, before], week)
    assert.deepEqual(bars.map(bar => bar.event.id), ['before', 'long', 'short'], '同起始列时长者在前')
    assert.equal(bars[0]?.continuesBefore, true)
    assert.equal(bars[1]?.continuesAfter, true)
    assert.equal(bars[2]?.span, 2)
  })

  it('groupByDay：跨天日程出现在覆盖的每一天，且每天只出现一次', () => {
    const training = event('training', '2026-11-24T00:00:00.000Z', '2026-11-28T00:00:00.000Z', { allDay: true })
    const groups = /** @type {any[]} */ (groupByDay([training], new Date(2026, 10, 24), 5))
    assert.deepEqual(groups.map(group => group.events.length), [1, 1, 1, 1, 0])
    for (const group of groups.slice(0, 4)) {
      assert.deepEqual(group.events.map(e => e.id), ['training'])
    }
  })

  it('isoWeekNumber 按 ISO-8601（周一起始、跨年周归属周四所在年）', () => {
    assert.equal(isoWeekNumber(new Date(2026, 10, 9)), 46, '2026-11-09 是第 46 周')
    assert.equal(isoWeekNumber(new Date(2026, 0, 1)), 1, '2026-01-01（周四）属第 1 周')
    assert.equal(isoWeekNumber(new Date(2025, 11, 29)), 1, '2025-12-29 周一起即 2026 年第 1 周')
    assert.equal(isoWeekNumber(new Date(2026, 11, 31)), 53, '2026-12-31 属第 53 周')
    assert.equal(isoWeekNumber(new Date(2026, 0, 5)), 2, '2026-01-05 周一进入第 2 周')
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
