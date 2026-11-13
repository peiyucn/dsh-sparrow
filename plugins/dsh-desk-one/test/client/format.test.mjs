// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatCompactNumber, formatDate, formatDateIn, formatDateTime, formatDuration, formatKilobytes,
  formatLocalDateTime, formatShortDate, formatTokenCount, formatTokens, relativeTimeOf,
} from '../../lib/client/app/utils.js'

describe('token 简写', () => {
  it('按官方口径缩写 K/M，小于 1000 保留整数', () => {
    assert.equal(formatCompactNumber(0), '0')
    assert.equal(formatCompactNumber(999), '999')
    assert.equal(formatCompactNumber(1234), '1.2K')
    assert.equal(formatCompactNumber(12_345), '12.3K')
    assert.equal(formatCompactNumber(52_800_000), '52.8M')
  })

  it('100 以上不带小数，且令牌后缀固定为 tok', () => {
    assert.equal(formatCompactNumber(123_456), '123K')
    assert.equal(formatTokens(12_345), '12.3K tok')
  })
})

describe('任务芯片的计数与耗时', () => {
  it('token 沿用历史小写口径（固定一位小数，不省略 .0）', () => {
    assert.equal(formatTokenCount(0), '0')
    assert.equal(formatTokenCount(950), '950')
    assert.equal(formatTokenCount(1_000), '1.0k')
    assert.equal(formatTokenCount(12_345), '12.3k')
    assert.equal(formatTokenCount(1_000_000), '1.0M')
  })

  it('模型耗时按 秒 / 分秒 / 时分 三档', () => {
    assert.equal(formatDuration(0), '0s')
    assert.equal(formatDuration(42_000), '42s')
    assert.equal(formatDuration(192_000), '3m 12s')
    assert.equal(formatDuration(3_840_000), '1h 04m')
  })
})

describe('相对时间分桶', () => {
  /** Fixed "now" so the buckets are stable across machines. */
  const now = new Date(2026, 10, 13, 12, 0, 0).getTime()

  it('未运行 / 刚刚 / 分钟 / 小时 / 天', () => {
    assert.deepEqual(relativeTimeOf(0, now), { unit: 'never', count: 0 })
    assert.deepEqual(relativeTimeOf(now - 30_000, now), { unit: 'now', count: 0 })
    assert.deepEqual(relativeTimeOf(now - 5 * 60_000, now), { unit: 'minutes', count: 5 })
    assert.deepEqual(relativeTimeOf(now - 2 * 3_600_000, now), { unit: 'hours', count: 2 })
    assert.deepEqual(relativeTimeOf(now - 3 * 86_400_000, now), { unit: 'days', count: 3 })
  })
})

describe('字节与便签日期戳', () => {
  it('KB 数值供字典自带的 KB 单位拼接', () => {
    assert.equal(formatKilobytes(0), '0.0')
    assert.equal(formatKilobytes(1536), '1.5')
  })

  it('便签日期戳为本地年月日（附时:分），无效输入回退 null', () => {
    const at = new Date(2026, 10, 3, 9, 5)
    assert.deepEqual(formatLocalDateTime(at), { short: '2026-11-03', full: '2026-11-03 09:05' })
    assert.equal(formatLocalDateTime('not-a-date'), null)
  })
})

describe('日期本地化', () => {
  /** Fixed local date: 2026-11-13 23:54, so month/day/hour are unambiguous across time zones. */
  const date = new Date(2026, 10, 13, 23, 54)

  it('中文界面用中文月份与中文日期顺序', () => {
    assert.equal(formatDateIn('zh-CN', date, 'short'), '11月13日')
    assert.equal(formatDateIn('zh-CN', date, 'date'), '2026/11/13')
    assert.equal(formatDateIn('zh-CN', date, 'time'), '23:54')
  })

  it('英文界面用英文月份与英文日期顺序', () => {
    assert.equal(formatDateIn('en', date, 'short'), 'Nov 13')
    assert.equal(formatDateIn('en', date, 'date'), '11/13/2026')
  })

  it('日期时间同时带本地化日期与时间', () => {
    const zh = formatDateIn('zh-CN', date, 'datetime')
    assert.match(zh, /2026/u)
    assert.match(zh, /23:54/u)
    const en = formatDateIn('en', date, 'datetime')
    assert.match(en, /2026/u)
    assert.match(en, /11:54/u)
  })

  it('日期跟随界面语言（官方 <html lang>），而不是浏览器语言', () => {
    const scope = /** @type {any} */ (globalThis)
    const original = scope.document
    scope.document = { documentElement: { lang: 'zh-CN' } }
    try {
      assert.equal(formatDate(date), '2026/11/13')
      assert.equal(formatShortDate(date), '11月13日')
      assert.equal(formatDateTime(date).includes('23:54'), true)
    } finally {
      scope.document = original
    }
  })

  it('无效输入回退不抛错', () => {
    assert.equal(formatDateIn('zh-CN', 'not-a-date'), 'not-a-date')
  })
})
