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

  it('按会话+轮次合计积分与调用次数，并按模型聚合', () => {
    const result = turnUsageOf(entries, 's1', 1)
    assert.equal(result.calls, 2)
    assert.ok(Math.abs(result.credit - 0.15) < 1e-9)
    assert.equal(result.byModel.length, 1)
    assert.equal(result.byModel[0].model, 'hy4-preview')
    assert.equal(result.byModel[0].calls, 2)
    assert.ok(Math.abs(result.byModel[0].credit - 0.15) < 1e-9)
  })

  it('turn 过滤生效，无 credit 的条目照计入调用次数', () => {
    const result = turnUsageOf(entries, 's1', 2)
    assert.equal(result.calls, 2)
    assert.ok(Math.abs(result.credit - 0.2) < 1e-9)
    assert.equal(result.byModel.length, 1)
    assert.equal(result.byModel[0].model, 'glm-5.3-flash')
    assert.equal(result.byModel[0].calls, 2)
    assert.ok(Math.abs(result.byModel[0].credit - 0.2) < 1e-9)
  })

  it('turn 未指定时按会话合计（sessionUsage 复用同一函数）', () => {
    const result = turnUsageOf(entries, 's2', undefined)
    assert.equal(result.calls, 1)
    assert.ok(Math.abs(result.credit - 0.3) < 1e-9)
    assert.equal(result.byModel.length, 1)
    assert.equal(result.byModel[0].model, 'hy3')
    assert.equal(result.byModel[0].calls, 1)
  })

  it('无匹配返回空', () => {
    const result = turnUsageOf(entries, 's9', 1)
    assert.deepEqual(result, { credit: 0, calls: 0, byModel: [] })
  })

  it('同一模型多次调用合并成一行，合计不受影响', () => {
    const many = [
      { sessionId: 's3', turn: 1, model: 'a', credit: 0.1 },
      { sessionId: 's3', turn: 1, model: 'b', credit: 0.2 },
      { sessionId: 's3', turn: 1, model: 'a', credit: 0.3 },
    ]
    const result = turnUsageOf(many, 's3', 1)
    assert.equal(result.calls, 3)
    assert.ok(Math.abs(result.credit - 0.6) < 1e-9)
    assert.deepEqual(result.byModel.map(b => ({ model: b.model, calls: b.calls })), [
      { model: 'a', calls: 2 },
      { model: 'b', calls: 1 },
    ])
    assert.ok(Math.abs(result.byModel[0].credit - 0.4) < 1e-9)
    assert.ok(Math.abs(result.byModel[1].credit - 0.2) < 1e-9)
  })
})
