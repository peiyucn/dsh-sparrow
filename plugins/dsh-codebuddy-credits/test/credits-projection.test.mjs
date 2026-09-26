/**
 * 会话积分投影单元的单测。
 *
 * 这个单元替代了被官方废弃的同步历史读（`Session.snapshotEvents()`）。它的契约比旧实现
 * 更严：注册表按事件驱动，所以「无兴趣必须返回同一引用」与「状态必须是无损 JSON」两条
 * 都是**会被宿主实际校验**的硬约束，不是风格问题。下面逐条钉住。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyCreditsEvent,
  codebuddyCreditsProjectionDefinition as def,
  creditsProjectionStateSchema,
  emptyCreditsState,
  viewOfCreditsState,
} from '../lib/credits-projection.js'

/** 造一条本 provider 的 assistant/message（credit 走 message.source.replayState）。 */
function ev({ seq, turn, step, model = 'deepseek-v4.1-flash', credit, provider = 'codebuddy-credits' }) {
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

/** 把一串事件喂进单元（模拟注册表逐事件驱动）。 */
function foldThroughUnit(events, from = emptyCreditsState()) {
  let state = from
  for (const event of events) state = def.apply(state, event)
  return state
}

test('注册表契约：单元带 key / stateVersion / stateSchema / init / apply', () => {
  assert.equal(def.key, 'codebuddyCredits')
  assert.equal(Number.isSafeInteger(def.stateVersion) && def.stateVersion >= 0, true, 'stateVersion 必须是非负整数')
  assert.equal(typeof def.stateSchema.parse, 'function', 'stateSchema 必须提供 parse')
  assert.equal(typeof def.init, 'function')
  assert.equal(typeof def.apply, 'function')
})

test('init 返回空状态，且每次调用互不共享可变对象', () => {
  const a = def.init()
  const b = def.init()
  assert.deepEqual(a, { credit: 0, calls: 0, byModel: [], byTurn: {} })
  a.byModel.push({ model: 'x', credit: 1, calls: 1 })
  assert.deepEqual(b.byModel, [], 'init 的返回值不得共享可变状态')
})

test('聚合：会话合计与按轮、按模型都正确', () => {
  const state = foldThroughUnit([
    ev({ seq: 0, turn: 1, step: 1, credit: 1.5 }),
    ev({ seq: 1, turn: 1, step: 2, credit: 0.5 }),
    ev({ seq: 2, turn: 2, step: 1, credit: 2.25 }),
  ])
  assert.equal(state.calls, 3)
  assert.equal(state.credit, 4.25)
  assert.deepEqual(state.byModel, [{ model: 'deepseek-v4.1-flash', credit: 4.25, calls: 3 }])
  assert.deepEqual(state.byTurn['1'], {
    credit: 2,
    calls: 2,
    byModel: [{ model: 'deepseek-v4.1-flash', credit: 2, calls: 2 }],
  })
  assert.equal(state.byTurn['2'].credit, 2.25)
})

test('按模型聚合：同模型合并一行、不同模型分行且顺序稳定', () => {
  const state = foldThroughUnit([
    ev({ seq: 0, turn: 1, step: 1, model: 'model-a', credit: 1 }),
    ev({ seq: 1, turn: 1, step: 2, model: 'model-b', credit: 2 }),
    ev({ seq: 2, turn: 1, step: 3, model: 'model-a', credit: 3 }),
  ])
  assert.deepEqual(state.byModel, [
    { model: 'model-a', credit: 4, calls: 2 },
    { model: 'model-b', credit: 2, calls: 1 },
  ])
})

test('⛔ 无关事件必须返回同一引用（Object.is）——注册表据此判定零下游工作', () => {
  const state = foldThroughUnit([ev({ seq: 0, turn: 1, step: 1, credit: 1 })])
  const unrelated = [
    { type: 'user/message', seq: 1, data: {} },
    { type: 'turn/start', seq: 2, data: { turn: 2 } },
    // 其它 provider 的消息
    ev({ seq: 3, turn: 2, step: 1, credit: 999, provider: 'deepseek-official' }),
    // 本 provider 但**没有 usage 帧**（流中断）：不计账
    { type: 'assistant/message', seq: 4, data: { turn: 2, step: 2, message: { source: { provider: 'codebuddy-credits', model: 'm' } } } },
  ]
  for (const event of unrelated) {
    assert.equal(def.apply(state, event), state, `事件 ${event.type}#${event.seq} 应原样返回同一引用`)
  }
  assert.equal(state.credit, 1, '无关事件不得改变合计')
  assert.equal(state.calls, 1)
})

test('重试的每一次扣费都累加，不被覆盖（owner 口径：真实表达）', () => {
  const state = foldThroughUnit([
    ev({ seq: 0, turn: 1, step: 1, credit: 5 }),
    ev({ seq: 1, turn: 1, step: 1, credit: 2 }), // 重试后的第二次扣费
  ])
  assert.equal(state.credit, 7, '两次扣费都要在：5 + 2')
  assert.equal(state.calls, 2, '两次调用都记')
  assert.equal(state.byTurn['1'].credit, 7)
  assert.equal(state.byTurn['1'].calls, 2)
})

test('纯转移：不修改入参状态', () => {
  const before = foldThroughUnit([ev({ seq: 0, turn: 1, step: 1, credit: 1 })])
  const snapshot = JSON.stringify(before)
  const after = def.apply(before, ev({ seq: 1, turn: 1, step: 2, credit: 9 }))
  assert.equal(JSON.stringify(before), snapshot, '入参状态不得被改动')
  assert.notEqual(after, before, '有兴趣的事件必须返回新引用')
  assert.equal(after.credit, 10)
})

test('有 usage 帧但 credit 非数字时仍计一次调用、credit 记 0；非有限数不入状态', () => {
  for (const bad of ['1.5', null, Number.NaN, Number.POSITIVE_INFINITY]) {
    const state = foldThroughUnit([ev({ seq: 0, turn: 1, step: 1, credit: bad })])
    assert.equal(state.calls, 1, `credit=${String(bad)} 仍应计一次调用`)
    assert.equal(state.credit, 0, `credit=${String(bad)} 不计积分`)
    // 关键：NaN / Infinity 一旦进入状态，投影缓存落盘会整条拒绝（无损 JSON 校验）。
    assert.equal(Number.isFinite(state.credit), true, `credit=${String(bad)} 不得把非有限数写进状态`)
  }
})

test('无 usage 帧（流中断）不计账', () => {
  const state = foldThroughUnit([
    { type: 'assistant/message', seq: 0, data: { turn: 1, step: 1, message: { source: { provider: 'codebuddy-credits', model: 'm' } } } },
  ])
  assert.equal(state.calls, 0)
  assert.equal(state.credit, 0)
})

test('⛔ 状态必须是「无损 JSON」——投影缓存会 snapshotJsonValue 校验后落盘', () => {
  // 官方 `session-projection-cache` 的 put() 调 `snapshotJsonValue(rows)`：
  // 只要状态里有 Map / undefined / NaN / 函数 / 循环引用，**整条记录**写盘失败
  //（抛 TypeError），退化为每次冷读都重折。所以这条得当成硬约束钉住。
  const state = foldThroughUnit([
    ev({ seq: 0, turn: 1, step: 1, credit: 1.5 }),
    ev({ seq: 1, turn: 2, step: 1, credit: 2.5 }),
  ])
  const roundTrip = JSON.parse(JSON.stringify(state))
  assert.deepEqual(roundTrip, state, 'JSON round-trip 必须无损（无 Map / undefined / 符号键）')
  // 键必须是字符串（turn 是数字，用 String(turn) 作键）
  assert.deepEqual(Object.keys(state.byTurn).sort(), ['1', '2'])
  // 状态里不得出现 undefined 值（JSON.stringify 会把它丢掉 → round-trip 不等）
  assert.equal(JSON.stringify(state).includes('undefined'), false)
})

test('stateSchema 校验合法状态，并**拒绝**损坏的缓存行（严格模式）', () => {
  const good = foldThroughUnit([ev({ seq: 0, turn: 1, step: 1, credit: 1.5 })])
  assert.deepEqual(creditsProjectionStateSchema.parse(JSON.parse(JSON.stringify(good))), good)

  // 多一个字段：旧版 schema 写的行必须被拒（否则会带病续算）
  assert.throws(() => creditsProjectionStateSchema.parse({ ...good, extra: 1 }))
  // 类型错
  assert.throws(() => creditsProjectionStateSchema.parse({ ...good, credit: 'nope' }))
  assert.throws(() => creditsProjectionStateSchema.parse({ ...good, calls: -1 }))
  // 缺字段
  assert.throws(() => creditsProjectionStateSchema.parse({ credit: 0, calls: 0, byModel: [] }))
  // byTurn 里嵌了坏行
  assert.throws(() => creditsProjectionStateSchema.parse({ ...good, byTurn: { 1: { credit: 1 } } }))
  // 非有限数
  assert.throws(() => creditsProjectionStateSchema.parse({ ...good, credit: Number.NaN }))
})

test('stateSchema 拒绝 Map 形状的 byTurn（必须是普通对象）', () => {
  // 走 JSON 边界：Map 序列化成 {}，round-trip 后 byTurn 变空对象——schema 仍接受空对象，
  // 但**不接受**数组 / null 这类形状。
  for (const bad of [null, [], 'x', 3]) {
    assert.throws(() => creditsProjectionStateSchema.parse({
      credit: 0, calls: 0, byModel: [], byTurn: bad,
    }), `byTurn=${String(bad)} 应被拒绝`)
  }
})

test('读面：session() 与 turn() 都返回视图；未出现的轮返回零值', () => {
  const state = foldThroughUnit([
    ev({ seq: 0, turn: 1, step: 1, credit: 2 }),
    ev({ seq: 1, turn: 2, step: 1, credit: 5 }),
  ])
  const view = viewOfCreditsState(state)
  assert.deepEqual(view.session(), {
    credit: 7,
    calls: 2,
    byModel: [{ model: 'deepseek-v4.1-flash', credit: 7, calls: 2 }],
  })
  assert.equal(view.turn(2).credit, 5)
  assert.deepEqual(view.turn(99), { credit: 0, calls: 0, byModel: [] })
})

test('读面返回的引用不会被后续事件改写（调用方持有安全）', () => {
  let state = foldThroughUnit([ev({ seq: 0, turn: 1, step: 1, credit: 1 })])
  const view = viewOfCreditsState(state)
  const before = view.session()
  const beforeSnapshot = JSON.stringify(before)
  state = def.apply(state, ev({ seq: 1, turn: 1, step: 2, credit: 5 }))
  // 旧引用指向的数组是上一版状态的数组：apply 走「复制后替换」，不改就数组
  assert.equal(JSON.stringify(before), beforeSnapshot, 'apply 不得改动已发出的视图数据')
})

test('增量驱动与一次性全折同结果（注册表就是逐事件驱动的）', () => {
  const events = [
    ev({ seq: 0, turn: 1, step: 1, credit: 1 }),
    { type: 'turn/end', seq: 1, data: { turn: 1 } },
    ev({ seq: 2, turn: 2, step: 1, credit: 2 }),
    ev({ seq: 3, turn: 2, step: 2, model: 'other', credit: 3 }),
  ]
  const incremental = foldThroughUnit(events)
  // 同一串事件从中间重放（模拟「缓存行 + 尾部事件」的 restore 路径）
  const firstHalf = def.apply(def.init(), events[0])
  const replayed = foldThroughUnit(events.slice(1), firstHalf)
  assert.deepEqual(replayed, incremental, '增量与全折必须逐字段一致')
})

test('空事件序列：状态恒等于 init', () => {
  assert.deepEqual(foldThroughUnit([]), def.init())
})
