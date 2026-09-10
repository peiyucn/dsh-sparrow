import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatCapacity } from '../lib/client/format.js'

describe('formatCapacity（只读清单的容量短串）', () => {
  it('百万级 应该 用 M（整数不带小数、非整保留一位）', () => {
    assert.equal(formatCapacity(1_000_000), '1M')
    assert.equal(formatCapacity(1_048_576), '1M')
    assert.equal(formatCapacity(2_500_000), '2.5M')
  })

  it('千级 应该 用 K', () => {
    assert.equal(formatCapacity(131_072), '131K')
    assert.equal(formatCapacity(1_000), '1K')
  })

  it('千以下 应该 原样（取整）', () => {
    assert.equal(formatCapacity(999), '999')
    assert.equal(formatCapacity(12.6), '13')
  })

  it('非法值 应该 返回 undefined（渲染侧按缺省处理）', () => {
    assert.equal(formatCapacity(undefined), undefined)
    assert.equal(formatCapacity(null), undefined)
    assert.equal(formatCapacity(0), undefined)
    assert.equal(formatCapacity(-1), undefined)
    assert.equal(formatCapacity(Number.NaN), undefined)
    assert.equal(formatCapacity('1000'), undefined)
  })
})