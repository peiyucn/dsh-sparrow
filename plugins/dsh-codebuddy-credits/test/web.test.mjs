import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { turnUsageOf } from '../lib/web.js'

describe('turnUsageOf', () => {
  const entries = [
    { sessionId: 's1', turn: 1, model: 'hy4-preview', credit: 0.1 },
    { sessionId: 's1', turn: 1, model: 'hy4-preview', credit: 0.05 },
    { sessionId: 's1', turn: 2, model: 'glm-5.3-flash' },
    { sessionId: 's1', turn: 2, model: 'glm-5.3-flash', credit: 0.2 },
    { sessionId: 's2', turn: 1, model: 'hy3', credit: 0.3 },
  ]

  it('按会话+轮次合计，明细保留最近 5 条', () => {
    const result = turnUsageOf(entries, 's1', 1)
    assert.equal(result.calls, 2)
    assert.ok(Math.abs(result.credit - 0.15) < 1e-9)
    assert.deepEqual(result.recent, [
      { model: 'hy4-preview', credit: 0.1 },
      { model: 'hy4-preview', credit: 0.05 },
    ])
  })

  it('turn 过滤生效，无 credit 的条目照计入调用次数', () => {
    const result = turnUsageOf(entries, 's1', 2)
    assert.equal(result.calls, 2)
    assert.ok(Math.abs(result.credit - 0.2) < 1e-9)
    assert.equal(result.recent[0].credit, undefined)
  })

  it('turn 未指定时按会话合计（sessionUsage 复用同一函数）', () => {
    const result = turnUsageOf(entries, 's2', undefined)
    assert.equal(result.calls, 1)
    assert.ok(Math.abs(result.credit - 0.3) < 1e-9)
  })

  it('无匹配返回空', () => {
    const result = turnUsageOf(entries, 's9', 1)
    assert.deepEqual(result, { credit: 0, calls: 0, recent: [] })
  })

  it('明细超过 5 条只保留最近 5 条，合计不受截断影响', () => {
    const many = Array.from({ length: 8 }, (_, index) => ({
      sessionId: 's3', turn: 1, model: 'm' + index, credit: 0.1,
    }))
    const result = turnUsageOf(many, 's3', 1)
    assert.equal(result.calls, 8)
    assert.ok(Math.abs(result.credit - 0.8) < 1e-9)
    assert.equal(result.recent.length, 5)
    assert.equal(result.recent[0].model, 'm3')
    assert.equal(result.recent[4].model, 'm7')
  })
})
