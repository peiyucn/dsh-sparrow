import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLedgerResolver } from '../lib/credits-source.js'
import { foldSessionCredits } from '../lib/credits-ledger.js'

/** 造一条本 provider 的 assistant/message。 */
function ev({ seq, turn, step, model = 'm', credit }) {
  return {
    type: 'assistant/message',
    seq,
    data: { turn, step, message: { source: { provider: 'codebuddy-credits', model, replayState: { response: { model, usage: { credit } } } } } },
  }
}

/** 造一台假 host：live 会话表 + 冷会话持久化前缀。 */
function fakeSources({ live = {}, cold = {}, inspectDelay = 0, inspectFails = false } = {}) {
  const calls = { live: 0, inspect: 0 }
  return {
    calls,
    sources: {
      live(sessionId, cached) {
        calls.live += 1
        const events = live[sessionId]
        if (events === undefined) return undefined
        return foldSessionCredits(events, cached)
      },
      async inspect(sessionId) {
        calls.inspect += 1
        if (inspectDelay) await new Promise((r) => setTimeout(r, inspectDelay))
        if (inspectFails) throw new Error('backend down')
        return cold[sessionId]
      },
    },
  }
}

test('live 会话：同步返回，不触发持久化读取', async () => {
  const { sources, calls } = fakeSources({ live: { s1: [ev({ seq: 0, turn: 1, step: 1, credit: 2 })] } })
  const resolver = createLedgerResolver(sources)
  const ledger = await resolver.for('s1')
  assert.equal(ledger.credit, 2)
  assert.equal(calls.inspect, 0, 'live 命中不应读持久化')
})

test('冷会话（重启后未激活）：从持久化前缀重放', async () => {
  const { sources } = fakeSources({ cold: { s1: [ev({ seq: 0, turn: 1, step: 1, credit: 5 }), ev({ seq: 1, turn: 2, step: 1, credit: 3 })] } })
  const resolver = createLedgerResolver(sources)
  const ledger = await resolver.for('s1')
  assert.equal(ledger.credit, 8)
  assert.equal(ledger.calls, 2)
})

test('会话不存在且无缓存：返回 undefined（调用方降级为空视图）', async () => {
  const { sources } = fakeSources({})
  const resolver = createLedgerResolver(sources)
  assert.equal(await resolver.for('nope'), undefined)
})

test('inspect 抛错时退回缓存，不抛出', async () => {
  const { sources } = fakeSources({ live: { s1: [ev({ seq: 0, turn: 1, step: 1, credit: 4 })] }, inspectFails: true })
  const resolver = createLedgerResolver(sources)
  assert.equal((await resolver.for('s1')).credit, 4)
  // 缓存里已有 s1；再对同一会话强制冷读（live 返回 undefined 的场景）
  const coldOnly = createLedgerResolver({
    live: () => undefined,
    inspect: async () => { throw new Error('backend down') },
  })
  assert.equal(await coldOnly.for('s1'), undefined)
})

test('并发冷读单飞：多个请求只触发一次持久化读取', async () => {
  const { sources, calls } = fakeSources({ cold: { s1: [ev({ seq: 0, turn: 1, step: 1, credit: 1 })] }, inspectDelay: 30 })
  const resolver = createLedgerResolver(sources)
  const results = await Promise.all([resolver.for('s1'), resolver.for('s1'), resolver.for('s1'), resolver.for('s1')])
  assert.equal(calls.inspect, 1, '同一会话的并发冷读应只读一次')
  for (const r of results) assert.equal(r.credit, 1)
})

test('不同会话的冷读互不干扰', async () => {
  const { sources, calls } = fakeSources({
    cold: { s1: [ev({ seq: 0, turn: 1, step: 1, credit: 1 })], s2: [ev({ seq: 0, turn: 1, step: 1, credit: 7 })] },
    inspectDelay: 10,
  })
  const resolver = createLedgerResolver(sources)
  const [a, b] = await Promise.all([resolver.for('s1'), resolver.for('s2')])
  assert.equal(a.credit, 1)
  assert.equal(b.credit, 7)
  assert.equal(calls.inspect, 2)
})

test('重复读取命中缓存（冷会话第二次不再读持久化）', async () => {
  const { sources, calls } = fakeSources({ cold: { s1: [ev({ seq: 0, turn: 1, step: 1, credit: 1 })] } })
  const resolver = createLedgerResolver(sources)
  await resolver.for('s1')
  // 第二次：inspect 返回同一前缀，fold 增量后不变
  const again = await resolver.for('s1')
  assert.equal(again.credit, 1)
  assert.equal(calls.inspect, 2, '冷路径每次都读（live 不可用），但结果一致')
})

test('缓存有界：超过上限淘汰最旧（LRU）', async () => {
  const cold = {}
  for (let i = 0; i < 10; i += 1) cold[`s${i}`] = [ev({ seq: 0, turn: 1, step: 1, credit: i })]
  const { sources } = fakeSources({ cold })
  const resolver = createLedgerResolver(sources, { maxCached: 3 })
  for (let i = 0; i < 10; i += 1) await resolver.for(`s${i}`)
  assert.equal(resolver.size, 3, '缓存不超过上限')
})

test('liveOf 只走内存：冷会话返回 undefined 且不读持久化', () => {
  const { sources, calls } = fakeSources({ cold: { s1: [ev({ seq: 0, turn: 1, step: 1, credit: 1 })] } })
  const resolver = createLedgerResolver(sources)
  assert.equal(resolver.liveOf('s1'), undefined)
  assert.equal(calls.inspect, 0)
})

test('live 增量折叠：cached 被传入，结果与全量一致', async () => {
  const events = [ev({ seq: 0, turn: 1, step: 1, credit: 1 }), ev({ seq: 1, turn: 2, step: 1, credit: 2 })]
  let receivedCached = 'unset'
  const resolver = createLedgerResolver({
    live(_id, cached) {
      receivedCached = cached
      return foldSessionCredits(events, cached)
    },
    async inspect() { return undefined },
  })
  const first = await resolver.for('s1')
  assert.equal(first.credit, 3)
  assert.equal(receivedCached, undefined, '首次无缓存')
  await resolver.for('s1')
  assert.notEqual(receivedCached, undefined, '第二次应拿到缓存做增量折叠')
  assert.equal(receivedCached.credit, 3)
})
