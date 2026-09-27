import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { apply } from '../lib/host.js'

/**
 * 浏览器信任栅栏的**接线**用例：走真实的 `apply` → `webServer.register` → handler。
 * 「栅栏存在但没被调用」是零价值，故这里断言的是**调用点**而非纯函数（纯判定见 trust.test.mjs）。
 *
 * 回归背景（实测于 0.1.7-rc.2）：官方 Host/Origin 栅栏与浏览器令牌认证都注册在
 * `/api` 前缀路由上，而 webServer 是「精确表优先、前缀最长者胜」——本插件的
 * `/api/file-manage` 更长，请求根本走不到官方检查。实测无栅栏时
 * `GET /api/file-manage/list` 无凭据 200，而官方 `/api/sessions` 401。
 *
 * 每次用例都真实 `apply` 一次：`apply` 里的 `deepSeekSurface()` 会跑一次官方
 * `DeepSeekFilesClient` 的形状探针（注入 fetch 桩、无网络），故这是完整启动路径。
 */

/**
 * 用最小 mock ctx 跑真实 apply，拿回注册的 prefix handler。
 * @param webRuntime - mock 的官方 `webRuntime` 服务值（栅栏的额外信任面）；默认无该服务。
 */
async function buildHarness(webRuntime = undefined) {
  let handler = null
  const warnings = []
  const ctx = {
    webServer: { register: (route) => { handler = route.handler; return () => {} } },
    credentials: { resolve: async () => ({ value: 'dummy-key' }) },
    settings: { describe: () => [] },
    logger: { warn: (message) => { warnings.push(message) }, error: () => {}, info: () => {} },
    effect: (fn) => { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {} },
    get: (name) => (name === 'webRuntime' ? webRuntime : undefined),
  }
  await apply(ctx)
  return { warnings, get handler() { return handler } }
}

/** 最小 req/res（handler 只用到 headers / method / url）。 */
async function request(handler, url, { method = 'GET', headers = { host: '127.0.0.1:3080' } } = {}) {
  let statusCode = 0
  const chunks = []
  const res = {
    headersSent: false,
    destroyed: false,
    setHeader: () => {},
    end: (chunk) => { chunks.push(chunk ?? '') },
  }
  Object.defineProperty(res, 'statusCode', { set: (value) => { statusCode = value }, get: () => statusCode })
  await handler({ method, url, headers }, res)
  const text = chunks.join('')
  return { statusCode, body: text === '' ? undefined : JSON.parse(text) }
}

describe('file-manage host 路由：浏览器信任栅栏接线（DNS rebinding / CSRF）', () => {
  it('⛔ rebinding：Host 与 Origin 同为攻击者域名 应该 403（不触发任何上游请求）', async () => {
    const h = await buildHarness()
    const result = await request(h.handler, '/api/file-manage/list', {
      headers: { host: 'evil.example:3080', origin: 'http://evil.example:3080' },
    })
    assert.equal(result.statusCode, 403)
    assert.equal(result.body.error.code, 'FORBIDDEN')
  })

  it('⛔ rebinding：无 Origin 只有攻击者 Host（浏览器图片式读取）应该 403', async () => {
    const h = await buildHarness()
    const result = await request(h.handler, '/api/file-manage/list', { headers: { host: 'evil.example:3080' } })
    assert.equal(result.statusCode, 403)
  })

  it('⛔ 跨站 Origin 应该 403（Host 是回环也拒）', async () => {
    const h = await buildHarness()
    const result = await request(h.handler, '/api/file-manage/list', {
      headers: { host: '127.0.0.1:3080', origin: 'http://evil.example' },
    })
    assert.equal(result.statusCode, 403)
  })

  it('⛔ sec-fetch-site: cross-site 应该 403（即使无 Origin）', async () => {
    const h = await buildHarness()
    const result = await request(h.handler, '/api/file-manage/list', {
      headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' },
    })
    assert.equal(result.statusCode, 403)
  })

  it('⛔ 缺 Host 头 应该 403', async () => {
    const h = await buildHarness()
    const result = await request(h.handler, '/api/file-manage/list', { headers: {} })
    assert.equal(result.statusCode, 403)
  })

  it('⛔ DELETE 路由同样先过栅栏：跨站删除请求必须 403（此路由会销毁用户云端文件）', async () => {
    const h = await buildHarness()
    const result = await request(h.handler, '/api/file-manage/files', {
      method: 'DELETE',
      headers: { host: 'evil.example:3080', origin: 'http://evil.example:3080' },
    })
    assert.equal(result.statusCode, 403)
    // 栅栏在最前：连 id 校验（400）都不该走到，更不会触达官方 Files API。
    assert.equal(result.body.error.code, 'FORBIDDEN')
  })

  it('同源浏览器请求（DSH 页面自身）应该 越过栅栏 —— 修复不得打断自家 UI', async () => {
    const h = await buildHarness()
    // 用一个明显无效的 id 走 DELETE：过栅栏后在 id 校验处 400，不会真的删除任何文件
    // （绝不拿真实 file id 做测试）。
    const result = await request(h.handler, '/api/file-manage/files?id=', {
      method: 'DELETE',
      headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'sec-fetch-site': 'same-origin' },
    })
    assert.equal(result.statusCode, 400, '栅栏放行后应由 id 校验拒绝空的 id')
    assert.equal(result.body.error.code, 'BAD_REQUEST')
  })

  it('无浏览器标记的本机客户端（curl / 脚本）应该 照常放行', async () => {
    const h = await buildHarness()
    const result = await request(h.handler, '/api/file-manage/files?id=', { method: 'DELETE', headers: { host: 'localhost:3080' } })
    assert.equal(result.statusCode, 400, '过了栅栏才轮到 id 校验')
  })

  it('官方 webRuntime 列出 LAN authority：同源 LAN 请求越过栅栏，未列的仍 403', async () => {
    const allowed = await buildHarness({ lanAddresses: ['192.168.1.5'], trustedHosts: ['192.168.1.5'] })
    const ok = await request(allowed.handler, '/api/file-manage/files?id=', {
      method: 'DELETE',
      headers: { host: '192.168.1.5:3080', origin: 'http://192.168.1.5:3080' },
    })
    assert.equal(ok.statusCode, 400)

    const other = await buildHarness()
    const denied = await request(other.handler, '/api/file-manage/files?id=', {
      method: 'DELETE',
      headers: { host: '192.168.1.5:3080', origin: 'http://192.168.1.5:3080' },
    })
    assert.equal(denied.statusCode, 403, '官方信任面缺席时未列的 LAN authority 必须拒')
  })

  it('官方信任面形状畸形（trustedHosts 非数组）应该 保守回退为只信回环，不抛穿', async () => {
    const h = await buildHarness({ trustedHosts: 'not-an-array' })
    const result = await request(h.handler, '/api/file-manage/list', {
      headers: { host: '192.168.1.5:3080', origin: 'http://192.168.1.5:3080' },
    })
    assert.equal(result.statusCode, 403)
  })
})
