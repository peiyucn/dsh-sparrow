import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { turnUsageOf } from '../lib/web.js'

describe('turnUsageOf', () => {
  const entries = [
    { sessionId: 's1', turn: 1, credit: 0.1 },
    { sessionId: 's1', turn: 1, credit: 0.05 },
    { sessionId: 's1', turn: 2 },
    { sessionId: 's1', turn: 2, credit: 0.2 },
    { sessionId: 's2', turn: 1, credit: 0.3 },
  ]

  it('按会话+轮次合计积分与调用次数', () => {
    const result = turnUsageOf(entries, 's1', 1)
    assert.equal(result.calls, 2)
    assert.ok(Math.abs(result.credit - 0.15) < 1e-9)
  })

  it('turn 过滤生效，无 credit 的条目照计入调用次数', () => {
    const result = turnUsageOf(entries, 's1', 2)
    assert.equal(result.calls, 2)
    assert.ok(Math.abs(result.credit - 0.2) < 1e-9)
  })

  it('turn 未指定时按会话合计（sessionUsage 复用同一函数）', () => {
    const result = turnUsageOf(entries, 's2', undefined)
    assert.equal(result.calls, 1)
    assert.ok(Math.abs(result.credit - 0.3) < 1e-9)
  })

  it('无匹配返回空', () => {
    const result = turnUsageOf(entries, 's9', 1)
    assert.deepEqual(result, { credit: 0, calls: 0 })
  })

  it('大量条目完整合计', () => {
    const many = Array.from({ length: 8 }, () => ({
      sessionId: 's3', turn: 1, credit: 0.1,
    }))
    const result = turnUsageOf(many, 's3', 1)
    assert.equal(result.calls, 8)
    assert.ok(Math.abs(result.credit - 0.8) < 1e-9)
  })
})
