import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyLedger,
  foldSessionCredits,
  creditSampleOf,
  turnViewOf,
  sessionViewOf,
} from '../lib/credits-ledger.js'

/** 造一条本 provider 的 assistant/message（credit 走 message.source.replayState）。 */
function assistantEvent({ seq, turn, step, model = 'deepseek-v4.1-flash', credit, provider = 'codebuddy-credits' }) {
  return {
    type: 'assistant/message',
    seq,
    data: {
      turn,
      step,
      message: {
        source: {
          kind: 'model',
          provider,
          model,
          ...(credit === undefined ? {} : { replayState: { response: { model, usage: { credit } } } }),
        },
      },
    },
  }
}

test('折叠本 provider 的 credit，按轮次与会话聚合', () => {
  const events = [
    assistantEvent({ seq: 0, turn: 1, step: 1, credit: 1.5 }),
    assistantEvent({ seq: 1, turn: 1, step: 2, credit: 0.5 }),
    assistantEvent({ seq: 2, turn: 2, step: 1, credit: 2.25 }),
  ]
  const ledger = foldSessionCredits(events)

  assert.equal(ledger.calls, 3)
  assert.equal(ledger.credit, 4.25)
  assert.deepEqual(turnViewOf(ledger, 1), {
    credit: 2,
    calls: 2,
    byModel: [{ model: 'deepseek-v4.1-flash', credit: 2, calls: 2 }],
  })
  assert.equal(turnViewOf(ledger, 2).credit, 2.25)
  assert.equal(turnViewOf(ledger, 99).calls, 0, '未出现的轮次返回零值')
})

test('按模型聚合：同模型合并一行，不同模型分行且顺序稳定', () => {
  const events = [
    assistantEvent({ seq: 0, turn: 1, step: 1, model: 'model-a', credit: 1 }),
    assistantEvent({ seq: 1, turn: 1, step: 2, model: 'model-b', credit: 2 }),
    assistantEvent({ seq: 2, turn: 1, step: 3, model: 'model-a', credit: 3 }),
  ]
  const { byModel } = foldSessionCredits(events)
  assert.deepEqual(byModel, [
    { model: 'model-a', credit: 4, calls: 2 },
    { model: 'model-b', credit: 2, calls: 1 },
  ])
})

test('忽略其它 provider 的 assistant 消息', () => {
  const events = [
    assistantEvent({ seq: 0, turn: 1, step: 1, credit: 1 }),
    assistantEvent({ seq: 1, turn: 1, step: 2, credit: 999, provider: 'deepseek-official' }),
  ]
  const ledger = foldSessionCredits(events)
  assert.equal(ledger.calls, 1)
  assert.equal(ledger.credit, 1)
})

test('忽略非 assistant/message 事件与缺 usage 的消息', () => {
  const events = [
    { type: 'user/message', seq: 0, data: {} },
    { type: 'turn/start', seq: 1, data: { turn: 1 } },
    assistantEvent({ seq: 2, turn: 1, step: 1, credit: 3 }),
    // 无 usage 帧：不计账（与「有 usage 缺 credit」区分）
    { type: 'assistant/message', seq: 3, data: { turn: 1, step: 2, message: { source: { provider: 'codebuddy-credits', model: 'm' } } } },
  ]
  const ledger = foldSessionCredits(events)
  assert.equal(ledger.calls, 1)
  assert.equal(ledger.credit, 3)
})

test('同 (turn, step) 重试：last-wins 替换而非累加（对齐官方 token-meter retry 语义）', () => {
  const events = [
    assistantEvent({ seq: 0, turn: 1, step: 1, credit: 5 }),
    assistantEvent({ seq: 1, turn: 1, step: 1, credit: 2 }), // 重试后的新样本
  ]
  const ledger = foldSessionCredits(events)
  assert.equal(ledger.calls, 1, '同一步只记一次')
  assert.equal(ledger.credit, 2, '取新样本')
})

test('增量折叠：from 之后的事件才计入，且结果与一次性折叠一致', () => {
  const events = [
    assistantEvent({ seq: 0, turn: 1, step: 1, credit: 1 }),
    assistantEvent({ seq: 1, turn: 1, step: 2, credit: 2 }),
    assistantEvent({ seq: 2, turn: 2, step: 1, credit: 4 }),
  ]
  const once = foldSessionCredits(events)

  const partial = foldSessionCredits(events.slice(0, 2))
  const merged = foldSessionCredits(events, partial) // 传全量，内部按 asOfSeq 跳过旧的

  assert.equal(merged.credit, once.credit)
  assert.equal(merged.calls, once.calls)
  assert.equal(merged.asOfSeq, once.asOfSeq)
})

test('纯函数：不修改入参账本', () => {
  const first = foldSessionCredits([assistantEvent({ seq: 0, turn: 1, step: 1, credit: 1 })])
  const before = { credit: first.credit, calls: first.calls, size: first.entries.size, seq: first.asOfSeq }
  foldSessionCredits([assistantEvent({ seq: 1, turn: 1, step: 2, credit: 9 })], first)
  assert.equal(first.credit, before.credit)
  assert.equal(first.calls, before.calls)
  assert.equal(first.entries.size, before.size)
  assert.equal(first.asOfSeq, before.seq)
})

test('asOfSeq 追随最后一条事件（含无关事件），保证增量游标不回退', () => {
  const ledger = foldSessionCredits([
    assistantEvent({ seq: 0, turn: 1, step: 1, credit: 1 }),
    { type: 'turn/end', seq: 7, data: { turn: 1 } },
  ])
  assert.equal(ledger.asOfSeq, 7)
})

test('非数字 seq（防御上游形状变化）不影响记账', () => {
  const ledger = foldSessionCredits([
    { type: 'assistant/message', data: { turn: 1, step: 1, message: { source: { provider: 'codebuddy-credits', model: 'm', replayState: { response: { usage: { credit: 2 } } } } } } },
  ])
  assert.equal(ledger.credit, 2)
  assert.equal(ledger.calls, 1)
})

test('有 usage 帧但 credit 非数字时，仍计一次调用、credit 记 0（与旧记账口径一致）', () => {
  for (const bad of ['1.5', null, Number.NaN]) {
    const ledger = foldSessionCredits([assistantEvent({ seq: 0, turn: 1, step: 1, credit: bad })])
    assert.equal(ledger.calls, 1, `credit=${String(bad)} 仍应计一次调用`)
    assert.equal(ledger.credit, 0, `credit=${String(bad)} 不计积分`)
  }
})

test('无 usage 帧（流中断）不计账', () => {
  const noUsage = {
    type: 'assistant/message',
    seq: 0,
    data: { turn: 1, step: 1, message: { source: { provider: 'codebuddy-credits', model: 'm' } } },
  }
  const ledger = foldSessionCredits([noUsage])
  assert.equal(ledger.calls, 0)
  assert.equal(ledger.credit, 0)
})

test('空事件序列返回空账本', () => {
  const ledger = foldSessionCredits([])
  assert.equal(ledger.credit, 0)
  assert.equal(ledger.calls, 0)
  assert.equal(ledger.asOfSeq, -1)
  assert.deepEqual(sessionViewOf(ledger), { credit: 0, calls: 0, byModel: [] })
})

test('creditSampleOf 对缺 message.source 的事件返回 undefined', () => {
  assert.equal(creditSampleOf({ type: 'assistant/message', seq: 0, data: { turn: 1, step: 1 } }), undefined)
  assert.equal(creditSampleOf({ type: 'user/message', seq: 0, data: {} }), undefined)
})

test('emptyLedger 可安全复用（不共享可变状态）', () => {
  const a = emptyLedger()
  const b = emptyLedger()
  assert.notEqual(a.entries, b.entries)
  assert.notEqual(a.byTurn, b.byTurn)
})
