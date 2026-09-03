import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { apply } from '../lib/host.js'

/**
 * 能力路由链路测试：用最小 mock ctx 走真实 apply + webServer handler，
 * 覆盖「请求 → 能力缓存 → visionModeForRoute → JSON 响应」整条 host 链路。
 * 这类测试是图标链路的一半（另一半是浏览器里的 client 渲染）。
 */

/** 记录 resolveModelInfo 调用次数的 mock llm。
 *  注意：cordis ctx.effect 的语义是同步执行回调注册副作用，mock 必须复现——
 *  否则 webServer.register 不会发生，路由测试就是空转（这正是第一次跑挂的原因）。 */
function buildHarness({ resolveModelInfo, defaultModel } = {}) {
  const calls = []
  let handler = null
  const ctx = {
    llm: {
      resolveModelInfo: resolveModelInfo ?? (async (provider, model) => {
        calls.push([provider, model])
        return { provider, id: model, inputModalities: model.includes('vision') ? ['image'] : ['text'] }
      }),
    },
    tools: { register: () => () => {} },
    attachments: { readImage: async () => {} },
    webServer: { register: (def) => { handler = def.handler } },
    effect: (fn) => {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    on: () => {},
    get: (key) => (key === 'agentDefaultModel'
      ? { currentSelection: () => defaultModel ?? { provider: 'deepseek-official', model: 'deepseek-v4-pro' } }
      : undefined),
  }
  apply(ctx, {})
  return { ctx, calls, get handler() { return handler } }
}

/** 用最小 req/res 调 handler，返回状态码与 JSON 体。 */
async function request(handler, url, method = 'GET') {
  let statusCode = 0
  const chunks = []
  const res = {
    headersSent: false,
    setHeader: () => {},
    end: (chunk) => { chunks.push(chunk ?? '') },
  }
  Object.defineProperty(res, 'statusCode', {
    set: (value) => { statusCode = value },
    get: () => statusCode,
  })
  await handler({ method, url }, res)
  return { statusCode, body: JSON.parse(chunks.join('')) }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

describe('dsh-vision-bridge 能力路由链路', () => {
  it('DeepSeek 文本模型 应该 返回 cross-model', async () => {
    const { handler } = buildHarness()
    const result = await request(handler, '/api/vision-bridge/capability?provider=deepseek-official&model=deepseek-v4-pro')
    assert.equal(result.statusCode, 200)
    assert.equal(result.body.mode, 'cross-model')
    assert.equal(typeof result.body.visionModel, 'string')
  })

  it('视觉模型 应该 返回 native-vision', async () => {
    const { handler } = buildHarness()
    const result = await request(handler, '/api/vision-bridge/capability?provider=deepseek-official&model=deepseek-v4-flash-vision-exp')
    assert.equal(result.body.mode, 'native-vision')
  })

  it('其它 provider 文本模型 应该 返回 no-vision', async () => {
    const { handler } = buildHarness()
    const result = await request(handler, '/api/vision-bridge/capability?provider=other&model=some-model')
    assert.equal(result.body.mode, 'no-vision')
  })

  it('缺少 provider/model 应该 400', async () => {
    const { handler } = buildHarness()
    const result = await request(handler, '/api/vision-bridge/capability?provider=deepseek-official')
    assert.equal(result.statusCode, 400)
  })

  it('非 GET 应该 405', async () => {
    const { handler } = buildHarness()
    const result = await request(handler, '/api/vision-bridge/capability?provider=a&model=b', 'POST')
    assert.equal(result.statusCode, 405)
  })

  it('同模型重复查询 应该 命中缓存不再解析', async () => {
    // 能力缓存是模块级的（进程内共享），用独特模型名隔离本用例。
    const model = 'cache-test-model'
    const { handler, calls } = buildHarness({ defaultModel: { provider: 'deepseek-official', model: 'other-preheat-model' } })
    await request(handler, `/api/vision-bridge/capability?provider=deepseek-official&model=${model}`)
    const afterFirst = calls.length
    await request(handler, `/api/vision-bridge/capability?provider=deepseek-official&model=${model}`)
    assert.equal(calls.length, afterFirst)
  })

  it('启动预热 应该 提前解析默认模型（首查毫秒级）', async () => {
    const preheatModel = 'preheat-test-model'
    const { handler, calls } = buildHarness({ defaultModel: { provider: 'deepseek-official', model: preheatModel } })
    await sleep(10)
    const warmed = calls.some(([provider, model]) => provider === 'deepseek-official' && model === preheatModel)
    assert.equal(warmed, true)
    const before = calls.length
    await request(handler, `/api/vision-bridge/capability?provider=deepseek-official&model=${preheatModel}`)
    assert.equal(calls.length, before)
  })

  it('能力解析失败 应该 按无视觉能力处理（不抛 500）', async () => {
    const { handler } = buildHarness({
      resolveModelInfo: async (provider, model) => {
        if (model === 'broken') throw new Error('no catalog')
        return { provider, id: model, inputModalities: ['text'] }
      },
    })
    const result = await request(handler, '/api/vision-bridge/capability?provider=deepseek-official&model=broken')
    assert.equal(result.statusCode, 200)
    assert.equal(result.body.mode, 'cross-model')
  })
})
