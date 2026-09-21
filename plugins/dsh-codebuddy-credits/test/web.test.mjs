import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { sessionViewOf, turnViewOf, foldSessionCredits } from '../lib/credits-ledger.js'

/**
 * web 路由层的聚合视图口径。
 *
 * 原先这里测的是 web.ts 的 turnUsageOf（对进程内 usageLog 聚合）；记账改成
 * 「会话事件重放」（credits-ledger）后该函数已删除，故契约测试随之移到
 * sessionViewOf / turnViewOf —— 断言的是同一组用户可见口径：
 * 按会话/轮次合计、按模型聚合一行、调用次数不因缺 credit 而丢失。
 */

/** 造一条本 provider 的 assistant/message。 */
function ev({ seq, turn, step, model = 'hy4-preview', credit, creditMissing = false }) {
  return {
    type: 'assistant/message',
    seq,
    data: {
      turn,
      step,
      message: {
        source: {
          provider: 'codebuddy-credits',
          model,
          replayState: { response: { model, usage: creditMissing ? {} : { credit } } },
        },
      },
    },
  }
}

describe('会话/轮次聚合视图（sessionViewOf / turnViewOf）', () => {
  const ledger = foldSessionCredits([
    ev({ seq: 0, turn: 1, step: 1, credit: 0.1 }),
    ev({ seq: 1, turn: 1, step: 2, credit: 0.05 }),
    ev({ seq: 2, turn: 2, step: 1, model: 'glm-5.3-flash', creditMissing: true }),
    ev({ seq: 3, turn: 2, step: 2, model: 'glm-5.3-flash', credit: 0.2 }),
  ])

  it('按轮次合计积分与调用次数，并按模型聚合', () => {
    const result = turnViewOf(ledger, 1)
    assert.equal(result.calls, 2)
    assert.ok(Math.abs(result.credit - 0.15) < 1e-9)
    assert.equal(result.byModel.length, 1)
    assert.equal(result.byModel[0].model, 'hy4-preview')
    assert.equal(result.byModel[0].calls, 2)
    assert.ok(Math.abs(result.byModel[0].credit - 0.15) < 1e-9)
  })

  it('缺 credit 的调用照计调用次数、积分记 0', () => {
    const result = turnViewOf(ledger, 2)
    assert.equal(result.calls, 2)
    assert.ok(Math.abs(result.credit - 0.2) < 1e-9)
    assert.equal(result.byModel.length, 1)
    assert.equal(result.byModel[0].model, 'glm-5.3-flash')
    assert.equal(result.byModel[0].calls, 2)
    assert.ok(Math.abs(result.byModel[0].credit - 0.2) < 1e-9)
  })

  it('会话视图 = 全部轮次合计', () => {
    const result = sessionViewOf(ledger)
    assert.equal(result.calls, 4)
    assert.ok(Math.abs(result.credit - 0.35) < 1e-9)
    assert.equal(result.byModel.length, 2)
  })

  it('无匹配轮次返回空', () => {
    assert.deepEqual(turnViewOf(ledger, 99), { credit: 0, calls: 0, byModel: [] })
  })

  it('空账本返回空视图', () => {
    assert.deepEqual(sessionViewOf(foldSessionCredits([])), { credit: 0, calls: 0, byModel: [] })
  })
})
