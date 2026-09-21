import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installCodeBuddyWeb } from '../lib/web.js'

/**
 * host 路由链路测试：用最小 mock ctx 走真实 installCodeBuddyWeb + webServer handler，
 * 覆盖「请求 → 入参校验 → shared 调用 → JSON 响应」整条链路（对照 vision-bridge 的 host-route 测试）。
 * 注意 cordis 的语义：ctx.inject 与 ctx.effect 都会**同步执行**回调注册副作用，mock 必须复现，
 * 否则 webServer.register 不会发生、路由测试就是空转。
 */
function buildHarness(overrides = {}) {
  const calls = { refreshModels: 0 }
  let handler = null
  const shared = {
    keyConfigured: async () => true,
    saveKey: async () => {},
    reapply: async () => {},
    removeKey: async () => {},
    quota: async () => ({ total: 0, used: 0 }),
    sessionUsage: async () => ({ credit: 0, calls: 0, byModel: [] }),
    turnUsage: async () => ({ credit: 0, calls: 0, byModel: [] }),
    active: () => true,
    account: () => ({ enterpriseName: 'Acme' }),
    ensureAccount: async () => {},
    ensureModels: async () => {},
    refreshModels: async () => { calls.refreshModels += 1; return { changed: false, models: [] } },
    models: () => [],
    maxMode: () => false,
    setMaxMode: async () => {},
    ...overrides,
  }
  const ctx = {
    inject: (_names, cb) => { cb({ webServer: { register: (def) => { handler = def.handler; return () => {} } } }) },
    effect: (fn) => { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {} },
  }
  installCodeBuddyWeb(ctx, shared)
  return { shared, calls, get handler() { return handler } }
}

/** 最小 req/res：req 带 loopback remoteAddress（路由的 localOnly 栅栏依赖它）。 */
async function request(handler, url, { method = 'POST', address = '127.0.0.1' } = {}) {
  let statusCode = 0
  const chunks = []
  const res = {
    headersSent: false,
    setHeader: () => {},
    end: (chunk) => { chunks.push(chunk ?? '') },
  }
  Object.defineProperty(res, 'statusCode', { set: (value) => { statusCode = value }, get: () => statusCode })
  await handler({ method, url, socket: { remoteAddress: address } }, res)
  const text = chunks.join('')
  return { statusCode, body: text === '' ? undefined : JSON.parse(text) }
}

const PREVIEW = {
  id: 'hy4-preview',
  name: 'hy4-preview',
  credits: 'x0.79',
  input: ['text', 'image'],
  contextWindow: 1_000_000,
  maxTokens: 32_768,
  reasoning: false,
}

describe('codebuddy host 路由：/refresh-models', () => {
  it('已配 Key 且有变化 应该 回 ok/changed/models/account', async () => {
    const h = buildHarness({ refreshModels: async () => { h.calls.refreshModels += 1; return { changed: true, models: [PREVIEW] } } })
    const result = await request(h.handler, '/api/codebuddy-credits/refresh-models')
    assert.equal(result.statusCode, 200)
    assert.equal(result.body.ok, true)
    assert.equal(result.body.changed, true)
    assert.equal(result.body.account.enterpriseName, 'Acme')
    assert.equal(result.body.models.length, 1)
    assert.equal(result.body.models[0].id, 'hy4-preview')
    assert.equal(result.body.models[0].credits, 'x0.79')
    assert.equal(result.body.models[0].vision, true)   // input 含 image → 只读清单据此展示
    assert.equal(h.calls.refreshModels, 1)
  })

  it('无变化 应该 changed=false（UI 显示「已是最新」）', async () => {
    const h = buildHarness({ refreshModels: async () => { h.calls.refreshModels += 1; return { changed: false, models: [PREVIEW] } } })
    const result = await request(h.handler, '/api/codebuddy-credits/refresh-models')
    assert.equal(result.statusCode, 200)
    assert.equal(result.body.changed, false)
    assert.equal(result.body.models.length, 1)
  })

  it('未配置 Key 应该 400 且不触发上游扫描', async () => {
    const h = buildHarness({ keyConfigured: async () => false })
    const result = await request(h.handler, '/api/codebuddy-credits/refresh-models')
    assert.equal(result.statusCode, 400)
    assert.equal(result.body.error, '未配置 Key')
    assert.equal(h.calls.refreshModels, 0)
  })

  it('非回环来源 应该 403（localOnly 栅栏）', async () => {
    const h = buildHarness()
    const result = await request(h.handler, '/api/codebuddy-credits/refresh-models', { address: '10.0.0.7' })
    assert.equal(result.statusCode, 403)
    assert.equal(h.calls.refreshModels, 0)
  })

  it('上游失败 应该 透传错误消息为 400（路由统一 catch）', async () => {
    const h = buildHarness({ refreshModels: async () => { throw new Error('CodeBuddy 模型配置接口返回 401') } })
    const result = await request(h.handler, '/api/codebuddy-credits/refresh-models')
    assert.equal(result.statusCode, 400)
    assert.match(result.body.error, /401/u)
  })
})

describe('codebuddy host 路由：/session-usage 与 /turn-usage（异步积分面）', () => {
  // 这两条路由是「积分改由事件重放」时唯一变 sync→async 的出口。此前**零覆盖**：
  // 实测删掉整段 if、或去掉 await，148 个用例全绿 —— 而 `await` 一旦漏掉，
  // `JSON.stringify(Promise)` 会静默变成 `{}` 发给客户端，积分面板永远空。
  it('GET /session-usage 应该 await 异步账本并原样回传', async () => {
    let asked = null
    const h = buildHarness({
      sessionUsage: async (sessionId) => {
        asked = sessionId
        return { credit: 12.5, calls: 3, byModel: [{ model: 'hy4-preview', credit: 12.5, calls: 3 }] }
      },
    })
    const result = await request(h.handler, '/api/codebuddy-credits/session-usage?sessionId=abc', { method: 'GET' })
    assert.equal(result.statusCode, 200)
    assert.equal(asked, 'abc')
    assert.equal(result.body.credit, 12.5, '必须是解析后的对象，不能是 {}')
    assert.equal(result.body.calls, 3)
    assert.equal(result.body.byModel[0].model, 'hy4-preview')
  })

  it('GET /session-usage 缺 sessionId 应该 400 且不调账本', async () => {
    let called = 0
    const h = buildHarness({ sessionUsage: async () => { called += 1; return { credit: 0, calls: 0, byModel: [] } } })
    const result = await request(h.handler, '/api/codebuddy-credits/session-usage', { method: 'GET' })
    assert.equal(result.statusCode, 400)
    assert.equal(called, 0)
  })

  it('GET /turn-usage 应该 回该轮视图', async () => {
    const seen = []
    const h = buildHarness({
      turnUsage: async (sessionId, turn) => {
        seen.push([sessionId, turn])
        return { credit: 4, calls: 1, byModel: [] }
      },
    })
    const result = await request(h.handler, '/api/codebuddy-credits/turn-usage?sessionId=s1&turn=7', { method: 'GET' })
    assert.equal(result.statusCode, 200)
    assert.deepEqual(seen, [['s1', 7]])
    assert.equal(result.body.credit, 4)
  })

  it('GET /turn-usage 非法 turn 应该 400（负数 / 非整数 / 缺参）', async () => {
    let called = 0
    const h = buildHarness({ turnUsage: async () => { called += 1; return { credit: 0, calls: 0, byModel: [] } } })
    for (const query of ['sessionId=s1&turn=-1', 'sessionId=s1&turn=1.5', 'sessionId=s1', 'turn=2']) {
      const result = await request(h.handler, `/api/codebuddy-credits/turn-usage?${query}`, { method: 'GET' })
      assert.equal(result.statusCode, 400, `${query} 应 400`)
    }
    assert.equal(called, 0, '非法入参不得触达账本')
  })

  it('账本抛错 应该 被路由统一 catch 成 400（不冒泡进宿主管线）', async () => {
    const h = buildHarness({ sessionUsage: async () => { throw new Error('replay boom') } })
    const result = await request(h.handler, '/api/codebuddy-credits/session-usage?sessionId=abc', { method: 'GET' })
    assert.equal(result.statusCode, 400)
    assert.match(result.body.error, /replay boom/u)
  })
})