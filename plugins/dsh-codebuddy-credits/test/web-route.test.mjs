import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installCodeBuddyWeb } from '../lib/web.js'

/**
 * host 路由链路测试：用最小 mock ctx 走真实 installCodeBuddyWeb + webServer handler，
 * 覆盖「请求 → 入参校验 → shared 调用 → JSON 响应」整条链路（对照 vision-bridge 的 host-route 测试）。
 * 注意 cordis 的语义：ctx.inject 与 ctx.effect 都会**同步执行**回调注册副作用，mock 必须复现，
 * 否则 webServer.register 不会发生、路由测试就是空转。
 * @param overrides - shared 覆盖项。
 * @param webRuntime - mock 的官方 `webRuntime` 服务值（栅栏的额外信任面）；默认无该服务。
 */
function buildHarness(overrides = {}, webRuntime = undefined) {
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
    get: (name) => (name === 'webRuntime' ? webRuntime : undefined),
  }
  installCodeBuddyWeb(ctx, shared)
  return { shared, calls, get handler() { return handler } }
}

/**
 * 最小 req/res：req 带 loopback remoteAddress 与同源 Host 头（路由的浏览器信任栅栏
 * 与 localOnly 网段检查都依赖它们）。默认 `host: '127.0.0.1:3080'` = DSH 页面同源请求。
 */
async function request(handler, url, { method = 'POST', address = '127.0.0.1', headers = { host: '127.0.0.1:3080' } } = {}) {
  let statusCode = 0
  const chunks = []
  const res = {
    headersSent: false,
    setHeader: () => {},
    end: (chunk) => { chunks.push(chunk ?? '') },
  }
  Object.defineProperty(res, 'statusCode', { set: (value) => { statusCode = value }, get: () => statusCode })
  await handler({ method, url, headers, socket: { remoteAddress: address } }, res)
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

/**
 * 浏览器信任栅栏的**接线**用例（栅栏存在但从没被调用 = 零价值，故这里走真实 handler）。
 *
 * 回归背景（实测于 0.1.7-rc.2）：官方 Host/Origin 栅栏与浏览器令牌认证都注册在
 * `/api` 前缀路由上，而 webServer 是「精确表优先、前缀最长者胜」——本插件的
 * `/api/codebuddy-credits` 更长，请求根本走不到官方检查。实测无栅栏时
 * `GET /api/codebuddy-credits/status` 无凭据 200，而官方 `/api/sessions` 401。
 */
describe('codebuddy host 路由：浏览器信任栅栏接线（DNS rebinding / CSRF）', () => {
  it('⛔ rebinding：Host 与 Origin 同为攻击者域名 应该 403 且不触达 shared', async () => {
    const h = buildHarness()
    const result = await request(h.handler, '/api/codebuddy-credits/status', {
      method: 'GET',
      headers: { host: 'evil.example:3080', origin: 'http://evil.example:3080' },
    })
    assert.equal(result.statusCode, 403)
    assert.equal(result.body.error, '拒绝跨站来源的请求')
  })

  it('⛔ rebinding：无 Origin 只有攻击者 Host（浏览器图片式读取）应该 403', async () => {
    const h = buildHarness()
    const result = await request(h.handler, '/api/codebuddy-credits/status', {
      method: 'GET',
      headers: { host: 'evil.example:3080' },
    })
    assert.equal(result.statusCode, 403)
  })

  it('⛔ 跨站 Origin 应该 403（Host 是回环也拒）', async () => {
    const h = buildHarness()
    const result = await request(h.handler, '/api/codebuddy-credits/status', {
      method: 'GET',
      headers: { host: '127.0.0.1:3080', origin: 'http://evil.example' },
    })
    assert.equal(result.statusCode, 403)
  })

  it('⛔ sec-fetch-site: cross-site 应该 403（即使无 Origin，且 Host 是回环）', async () => {
    const h = buildHarness()
    const result = await request(h.handler, '/api/codebuddy-credits/status', {
      method: 'GET',
      headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' },
    })
    assert.equal(result.statusCode, 403)
  })

  it('⛔ 缺 Host 头 应该 403', async () => {
    const h = buildHarness()
    const result = await request(h.handler, '/api/codebuddy-credits/status', { method: 'GET', headers: {} })
    assert.equal(result.statusCode, 403)
  })

  it('⛔ 变更类路由（POST /remove-key）同样先过栅栏：跨站请求不得触达 removeKey', async () => {
    let removed = 0
    const h = buildHarness({ removeKey: async () => { removed += 1 } })
    const result = await request(h.handler, '/api/codebuddy-credits/remove-key', {
      headers: { host: 'evil.example:3080', origin: 'http://evil.example:3080' },
    })
    assert.equal(result.statusCode, 403)
    assert.equal(removed, 0, '被栅栏拒绝的请求不得执行任何副作用')
  })

  it('同源浏览器请求（DSH 页面自身）应该 照常 200 —— 修复不得打断自家 UI', async () => {
    const h = buildHarness()
    const result = await request(h.handler, '/api/codebuddy-credits/status', {
      method: 'GET',
      headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'sec-fetch-site': 'same-origin' },
    })
    assert.equal(result.statusCode, 200)
    assert.equal(result.body.active, true)
  })

  it('无浏览器标记的本机客户端（curl / 脚本）应该 照常放行', async () => {
    const h = buildHarness()
    const result = await request(h.handler, '/api/codebuddy-credits/status', { method: 'GET', headers: { host: 'localhost:3080' } })
    assert.equal(result.statusCode, 200)
  })

  it('官方 webRuntime 列出的 LAN authority：同源 LAN 请求放行，未列的仍 403', async () => {
    // 官方信任面在场（web-app 绑定 0.0.0.0 时采样出的 LAN 地址）：同源 LAN 请求应放行。
    const allowed = buildHarness({}, { lanAddresses: ['192.168.1.5'], trustedHosts: ['192.168.1.5'] })
    const ok = await request(allowed.handler, '/api/codebuddy-credits/status', {
      method: 'GET',
      headers: { host: '192.168.1.5:3080', origin: 'http://192.168.1.5:3080' },
    })
    assert.equal(ok.statusCode, 200)
    // 官方信任面缺席（老宿主 / 非 web 组合）→ 保守回退为只信回环。
    // 注意 remoteAddress 仍是回环：localOnly 只认 socket 来源，栅栏才是 Host/Origin 那道。
    const other = buildHarness()
    const denied = await request(other.handler, '/api/codebuddy-credits/status', {
      method: 'GET',
      headers: { host: '192.168.1.5:3080', origin: 'http://192.168.1.5:3080' },
    })
    assert.equal(denied.statusCode, 403, '官方信任面缺席时未列的 LAN authority 必须拒')
  })
})