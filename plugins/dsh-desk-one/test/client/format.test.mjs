// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatCompactNumber, formatTokens } from '../../lib/client/app/utils.js'

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
