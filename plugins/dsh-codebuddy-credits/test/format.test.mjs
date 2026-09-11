import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatCapacity, formatCredits, formatModelFacts } from '../lib/client/format.js'

describe('formatCredits（积分数字：会话胶囊 / 每轮胶囊 / 两者弹层标题共用口径）', () => {
  it('整数 应该 不挂小数位', () => {
    assert.equal(formatCredits(2000), '2000')
    assert.equal(formatCredits(0), '0')
  })

  it('非整数 应该 保留两位', () => {
    assert.equal(formatCredits(0.41), '0.41')
    assert.equal(formatCredits(1999.59), '1999.59')
    assert.equal(formatCredits(1.005), '1.00')
  })

  it('负数 应该 原样按同一口径（不吞号、不留 -0）', () => {
    assert.equal(formatCredits(-3), '-3')
    assert.equal(formatCredits(-0.5), '-0.50')
  })
})

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

  it('接近百万的边界 应该 进位到 1M（不出现 1000K）', () => {
    assert.equal(formatCapacity(999_999), '1M')
    assert.equal(formatCapacity(999_499), '999K')
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

describe('formatModelFacts（模型右侧只读事实：系数 · 上下文长度）', () => {
  it('系数与容量 应该 用 · 分隔', () => {
    assert.equal(formatModelFacts({ credits: 'x0.79', contextWindow: 1_000_000 }), 'x0.79 · 1M')
  })

  it('零系数 应该 原样显示 x0.00（不再映射 free/免费）', () => {
    assert.equal(formatModelFacts({ credits: 'x0.00', contextWindow: 1_000_000 }), 'x0.00 · 1M')
  })

  it('缺一 应该 只显示另一项', () => {
    assert.equal(formatModelFacts({ contextWindow: 131_072 }), '131K')
    assert.equal(formatModelFacts({ credits: 'x1.62' }), 'x1.62')
  })

  it('无事实 应该 返回 undefined（渲染侧只显示模型名，无占位符）', () => {
    assert.equal(formatModelFacts(undefined), undefined)
    assert.equal(formatModelFacts({}), undefined)
    assert.equal(formatModelFacts({ credits: '' }), undefined)
    assert.equal(formatModelFacts({ credits: 'x0.00', contextWindow: 0 }), 'x0.00')
  })
})