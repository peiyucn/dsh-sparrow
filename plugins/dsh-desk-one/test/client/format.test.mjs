// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatCompactNumber, formatDate, formatDateIn, formatDateTime, formatShortDate, formatTokens,
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
