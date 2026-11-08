// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createHeaderFactsStore } from '../../../lib/host/sessions/archive.js'
import {
  finalizeRestoredSessions, healMissingSessionProjections, seedSessionProjections,
} from '../../../lib/host/sessions/projection-seed.js'

/**
 * 投影行回填的宿主桩：官方 `cachedSnapshot` 2 形参、`coldSnapshot` 3 形参
 * （与 0.2.2-rc.1 一致；形参个数决定调用形态，桩必须用真实个数，否则测不到分派逻辑）。
 *
 * @param {{
 *   headers?: any[],
 *   rows?: Map<string, { values: Record<string, unknown> }>,
 *   coldValues?: (header: any) => Record<string, unknown>,
 *   cacheAvailable?: boolean,
 *   coldSignature?: number,
 *   summaryKeys?: string[],
 *   live?: (id: string) => boolean,
 *   statThrows?: Set<string>,
 *   openThrows?: Set<string>,
 * }} [options]
 */
function makeCtx(options = {}) {
  const {
    headers = [], rows = new Map(), coldValues = () => ({ title: '冷标题', sessionStats: { turns: 3 } }),
    cacheAvailable = true, coldSignature = 3, summaryKeys, live = () => false,
    statThrows = new Set(), openThrows = new Set(),
  } = options
  const emitted = []
  const warnings = []
  const headerById = new Map(headers.map(header => [String(header.id), header]))
  let coldCalls = 0
  let openCalls = 0

  const cache = {
    /** 2 形参：官方 0.1.7+（含 0.2.2-rc.1）的列表读面。 */
    cachedSnapshot(meta, keys) {
      const row = rows.get(String(meta.id))
      if (row === undefined) return undefined
      const selected = keys === undefined
        ? row.values
        : Object.fromEntries(keys.filter(key => Object.hasOwn(row.values, key)).map(key => [key, row.values[key]]))
      if (Object.keys(selected).length === 0) return undefined
      return { asOfSeq: 7, values: selected }
    },
    /** 3 形参：官方冷日志折叠写回面（形参不足时调用方必须拒绝，不能猜）。 */
    coldSnapshot(meta, inheritedEventCount, events) {
      coldCalls += 1
      assert.equal(typeof inheritedEventCount, 'number')
      assert.ok(Array.isArray(events))
      const values = coldValues(meta)
      rows.set(String(meta.id), { values })
      return { asOfSeq: 9, values }
    },
  }
  if (coldSignature === 2) {
    // 只保留 2 个形参：模拟「官方改了签名、我们不认识」的宿主线。
    cache.coldSnapshot = function coldSnapshotTwo(meta, events) {
      coldCalls += 1
      return { asOfSeq: 1, values: { title: String(meta.id) } }
    }
  }

  const ctx = {
    sessionPersistence: {
      stat: async (id) => {
        if (statThrows.has(String(id))) throw new Error('stat boom')
        const header = headerById.get(String(id))
        return header === undefined ? undefined : { header, revision: 1 }
      },
      open: async (id) => {
        openCalls += 1
        if (openThrows.has(String(id))) throw new Error('open boom')
        const header = headerById.get(String(id))
        if (header === undefined) throw new Error('not found')
        return {
          header,
          inheritedEventCount: 0,
          read: async () => ({ eventState: {}, events: [] }),
          close: async () => {},
        }
      },
    },
    sessions: { get: (id) => live(String(id)) ? { id } : undefined },
    agents: { get: () => undefined },
    get: (name) => {
      if (name === 'sessionProjectionCache') return cacheAvailable ? cache : undefined
      if (name === 'sessionProjections' && summaryKeys !== undefined) return { summaryKeys: () => summaryKeys }
      return undefined
    },
    logger: { warn: (message) => { warnings.push(message) }, info: (message) => { warnings.push(message) } },
    emit: (event, payload) => { emitted.push({ event, payload }) },
  }
  return { ctx, emitted, warnings, rows, calls: () => ({ coldCalls, openCalls }) }
}

/** 普通会话 header（标题 / cwd 等字段与 treeHeaderOf 兼容）。 */
const header = (id, extra = {}) => ({ id, createdAt: 1, isSeeded: false, cwd: 'C:\\w', ...extra })

describe('projection-seed：还原 / 启动修复的投影行回填', () => {
  it('缓存行缺失 应该 读一次冷日志并走 coldSnapshot 写回（带 cached 投影块）', async () => {
    const { ctx, rows, calls } = makeCtx({ headers: [header('s1')] })
    const facts = await seedSessionProjections(ctx, ['s1'])
    assert.equal(calls().openCalls, 1, '缺行必须读完整冷日志')
    assert.equal(calls().coldCalls, 1, '必须调用官方 coldSnapshot 写回')
    const entry = facts.get('s1')
    assert.ok(entry !== undefined)
    assert.equal(entry.projections?.asOfSeq, 9)
    assert.equal(entry.projections?.values.title, '冷标题')
    // coldSnapshot 官方写回是 fire-and-forget：本模块同时更新了测试桩里的行，供后续断言。
    assert.equal(rows.get('s1')?.values.title, '冷标题')
  })

  it('行已可用 应该 零日志读取（stat + cachedSnapshot 即可）', async () => {
    const { ctx, calls } = makeCtx({
      headers: [header('s1')],
      rows: new Map([['s1', { values: { title: '缓存标题', sessionStats: { turns: 5 } } }]]),
    })
    const facts = await seedSessionProjections(ctx, ['s1'])
    assert.equal(calls().openCalls, 0, '行可用时不得再折日志')
    assert.equal(calls().coldCalls, 0)
    const entry = facts.get('s1')
    assert.equal(entry?.projections?.values.title, '缓存标题')
    assert.equal(entry?.blank, false)
  })

  it('空白会话（turns === 0）应该 回填后标记 blank', async () => {
    const { ctx } = makeCtx({
      headers: [header('empty')],
      coldValues: () => ({ title: '空会话', sessionStats: { turns: 0 } }),
    })
    const facts = await seedSessionProjections(ctx, ['empty'])
    assert.equal(facts.get('empty')?.blank, true)
  })

  it('子会话 行有 title 但缺 subagent 单元 应该 重新折叠（composer displayTitle 依赖它）', async () => {
    const { ctx, calls } = makeCtx({
      headers: [header('c1', { origin: 'subagent', parentSession: 'p' })],
      rows: new Map([['c1', { values: { title: '子会话标题' } }]]),
      coldValues: (meta) => ({ title: '子会话标题', subagent: { mode: 'one-shot', label: '审查代码' } }),
    })
    const facts = await seedSessionProjections(ctx, ['c1'])
    assert.equal(calls().coldCalls, 1, '缺 subagent 单元必须回填（否则 composer 显示裸 id）')
    assert.equal(facts.get('c1')?.projections?.values.subagent?.label, '审查代码')
  })

  it('缓存服务不可用 应该 仍返回 header 事实（added 只补条目）且不抛错', async () => {
    const { ctx, warnings } = makeCtx({ headers: [header('s1')], cacheAvailable: false })
    const facts = await seedSessionProjections(ctx, ['s1'])
    assert.equal(facts.get('s1')?.projections, undefined)
    assert.equal(facts.get('s1')?.header.id, 's1')
    assert.ok(warnings.some(message => message.includes('coldSnapshot')), `应有降级告警，实际：${JSON.stringify(warnings)}`)
  })

  it('官方 coldSnapshot 签名不认识（形参不足 3）应该 拒绝调用并降级', async () => {
    const { ctx, calls, warnings } = makeCtx({ headers: [header('s1')], coldSignature: 2 })
    const facts = await seedSessionProjections(ctx, ['s1'])
    assert.equal(calls().coldCalls, 0, '形参不足时不得猜着调用')
    assert.equal(facts.get('s1')?.projections, undefined)
    assert.ok(warnings.some(message => message.includes('coldSnapshot')))
  })

  it('读冷日志失败 应该 只告警并继续下一条（不中断整批）', async () => {
    const { ctx, warnings } = makeCtx({
      headers: [header('bad'), header('good')],
      openThrows: new Set(['bad']),
    })
    const facts = await seedSessionProjections(ctx, ['bad', 'good'])
    assert.equal(facts.has('bad'), true, '拿得到 header 的条目仍要保留（added 补条目）')
    assert.equal(facts.get('bad')?.projections, undefined)
    assert.equal(facts.get('good')?.projections?.values.title, '冷标题')
    assert.ok(warnings.some(message => message.includes('bad')))
  })

  it('stat 失败 / 会话不在持久化 应该 跳过该条', async () => {
    const { ctx } = makeCtx({ headers: [header('s1')], statThrows: new Set(['boom']) })
    const facts = await seedSessionProjections(ctx, ['boom', 'missing', 's1'])
    assert.equal(facts.has('boom'), false)
    assert.equal(facts.has('missing'), false)
    assert.equal(facts.has('s1'), true)
  })

  it('输入 id 去重 且保持顺序', async () => {
    const { ctx, emitted } = makeCtx({ headers: [header('b'), header('a')] })
    await finalizeRestoredSessions(ctx, ['b', 'a', 'b'])
    assert.deepEqual(emitted.map(entry => String(entry.payload.sessionId)), ['b', 'a'])
  })

  it('finalizeRestoredSessions 应该 按输入顺序补发带 cached 投影块的 added', async () => {
    const { ctx, emitted } = makeCtx({
      headers: [header('root'), header('child', { origin: 'subagent', parentSession: 'root' })],
    })
    await finalizeRestoredSessions(ctx, ['root', 'child'])
    assert.deepEqual(emitted.map(entry => entry.event), ['api-session/added', 'api-session/added'])
    assert.deepEqual(emitted.map(entry => String(entry.payload.sessionId)), ['root', 'child'])
    for (const entry of emitted) {
      assert.equal(entry.payload.projections?.kind, 'cached')
      assert.equal(typeof entry.payload.projections?.asOfSeq, 'number')
      assert.equal(typeof entry.payload.projections?.values.title, 'string')
      assert.equal(entry.payload.agentAvailable, false)
    }
    assert.equal(emitted[1].payload.parentSessionId, 'root')
    assert.equal(emitted[1].payload.origin, 'subagent')
  })

  it('added 的投影块 应该 只保留官方 summary 键集（避免把整行几十 KB 塞进列表事件）', async () => {
    const { ctx, emitted } = makeCtx({
      headers: [header('s1')],
      coldValues: () => ({ title: '摘要标题', sessionStats: { turns: 2 }, contextBreakdown: { systemTokens: 1 } }),
      summaryKeys: ['title', 'sessionStats'],
    })
    await finalizeRestoredSessions(ctx, ['s1'])
    const values = emitted[0]?.payload.projections?.values ?? {}
    assert.deepEqual(Object.keys(values).sort(), ['sessionStats', 'title'])
    assert.equal(values.title, '摘要标题')
  })

  it('healMissingSessionProjections 应该 跳过 live / 已有行，只回填缺行列并补发 added', async () => {
    const { ctx, emitted } = makeCtx({
      headers: [header('live'), header('cached'), header('missing')],
      rows: new Map([['cached', { values: { title: '已有标题' } }]]),
      live: id => id === 'live',
    })
    const store = createHeaderFactsStore(async () => ({
      headers: [header('live'), header('cached'), header('missing')],
      sizes: new Map(),
    }), 30_000, () => 0)
    await healMissingSessionProjections(ctx, store)
    assert.deepEqual(emitted.map(entry => String(entry.payload.sessionId)), ['missing'])
    assert.equal(emitted[0]?.payload.projections?.values.title, '冷标题')
  })

  it('healMissingSessionProjections 无缺行时 应该 零 added、零日志读取', async () => {
    const { ctx, emitted, calls } = makeCtx({
      headers: [header('a')],
      rows: new Map([['a', { values: { title: '标题 A' } }]]),
    })
    const store = createHeaderFactsStore(async () => ({ headers: [header('a')], sizes: new Map() }), 30_000, () => 0)
    await healMissingSessionProjections(ctx, store)
    assert.deepEqual(emitted, [])
    assert.equal(calls().openCalls, 0)
  })

  it('宿主没有 coldSnapshot 写回面时 heal 应该 直接返回（不白读整机日志）', async () => {
    const { ctx, emitted, calls } = makeCtx({ headers: [header('s1')], cacheAvailable: false })
    const store = createHeaderFactsStore(async () => ({ headers: [header('s1')], sizes: new Map() }), 30_000, () => 0)
    await healMissingSessionProjections(ctx, store)
    assert.deepEqual(emitted, [])
    assert.equal(calls().openCalls, 0)
  })
})
