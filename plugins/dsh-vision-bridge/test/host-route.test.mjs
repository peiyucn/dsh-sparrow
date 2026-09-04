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
function buildHarness({ resolveModelInfo, defaultModel, missingDefaultModel } = {}) {
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
      ? (missingDefaultModel === true
        ? undefined
        : { currentSelection: () => defaultModel ?? { provider: 'deepseek-official', model: 'deepseek-v4-pro' } })
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
  it('DeepSeek 文本模型 应该 返回 cross-model（显式声明 → declared:true）', async () => {
    const { handler } = buildHarness()
    const result = await request(handler, '/api/vision-bridge/capability?provider=deepseek-official&model=deepseek-v4-pro')
    assert.equal(result.statusCode, 200)
    assert.equal(result.body.mode, 'cross-model')
    assert.equal(result.body.declared, true)
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

  it('缺少 provider/model 应该 回退共享默认模型（空白会话/历史未装载窗口）', async () => {
    // 独特默认模型名隔离模块级缓存：回退后必然解析过它（预热或路由任一路径）。
    const model = 'fallback-test-model'
    const { handler, calls } = buildHarness({ defaultModel: { provider: 'deepseek-official', model } })
    const result = await request(handler, '/api/vision-bridge/capability')
    assert.equal(result.statusCode, 200)
    assert.equal(result.body.mode, 'cross-model')
    assert.ok(calls.some(([provider, hit]) => provider === 'deepseek-official' && hit === model))
  })

  it('缺少 provider/model 且默认模型服务缺失（旧版 dsh）应该 400', async () => {
    const { handler } = buildHarness({ missingDefaultModel: true })
    const result = await request(handler, '/api/vision-bridge/capability')
    assert.equal(result.statusCode, 400)
  })

  it('非 GET 应该 405', async () => {
    const { handler } = buildHarness()
    const result = await request(handler, '/api/vision-bridge/capability?provider=a&model=b', 'POST')
    assert.equal(result.statusCode, 405)
  })

  it('同模型重复查询 应该 命中缓存不再解析', async () => {
    // 能力缓存是模块级的（进程内共享），用独特模型名隔离本用例。
    // 只缓存正结果：命中缓存的前提是视觉模型（名字含 vision）。
    const model = 'cache-vision-test-model'
    const { handler, calls } = buildHarness({ defaultModel: { provider: 'deepseek-official', model: 'other-preheat-model' } })
    await request(handler, `/api/vision-bridge/capability?provider=deepseek-official&model=${model}`)
    const afterFirst = calls.length
    await request(handler, `/api/vision-bridge/capability?provider=deepseek-official&model=${model}`)
    assert.equal(calls.length, afterFirst)
  })

  it('启动预热 应该 提前解析默认模型（首查毫秒级）', async () => {
    // 只缓存正结果：预热命中缓存的场景必须是视觉模型（名字含 vision → mock 返回 image 能力）。
    const preheatModel = 'preheat-vision-test-model'
    const { handler, calls } = buildHarness({ defaultModel: { provider: 'deepseek-official', model: preheatModel } })
    await sleep(10)
    const warmed = calls.some(([provider, model]) => provider === 'deepseek-official' && model === preheatModel)
    assert.equal(warmed, true)
    const before = calls.length
    await request(handler, `/api/vision-bridge/capability?provider=deepseek-official&model=${preheatModel}`)
    assert.equal(calls.length, before)
  })

  it('无视觉能力的解析结果 应该 不入缓存（启动期假阴性不锁死图标）', async () => {
    // 文本模型解析结果为 false：不再缓存——provider 目录未就绪时的假阴性
    // 不能把图标永久锁在错误状态，每次查询现解（registry 查找，代价可忽略）。
    const model = 'no-negative-cache-test-model'
    const { handler, calls } = buildHarness({ defaultModel: { provider: 'deepseek-official', model: 'other-model' } })
    await request(handler, `/api/vision-bridge/capability?provider=deepseek-official&model=${model}`)
    const afterFirst = calls.length
    await request(handler, `/api/vision-bridge/capability?provider=deepseek-official&model=${model}`)
    assert.equal(calls.length, afterFirst + 1)
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
    assert.equal(result.body.declared, false)
  })

  it('目录未就绪（无 inputModalities 声明）应该 declared:false 且不缓存——重查自愈', async () => {
    // 首查模拟 provider 目录尚未装载：resolveModel 不给 inputModalities（未知）；
    // 第二次目录就绪、显式声明 image。若假阴性被缓存，第二次仍会是 no-vision。
    const model = 'lazy-catalog-model'
    let resolved = 0
    const { handler } = buildHarness({
      defaultModel: { provider: 'deepseek-official', model: 'other-preheat-model' },
      resolveModelInfo: async (provider, hit) => {
        if (hit !== model) return { provider, id: hit, inputModalities: ['text'] }
        resolved += 1
        return resolved === 1
          ? { provider, id: hit }
          : { provider, id: hit, inputModalities: ['text', 'image'] }
      },
    })
    const first = await request(handler, `/api/vision-bridge/capability?provider=other&model=${model}`)
    assert.equal(first.statusCode, 200)
    assert.equal(first.body.mode, 'no-vision')
    assert.equal(first.body.declared, false)
    assert.equal(resolved, 1)
    const second = await request(handler, `/api/vision-bridge/capability?provider=other&model=${model}`)
    assert.equal(second.body.mode, 'native-vision')
    assert.equal(second.body.declared, true)
    // 未知答案没有被缓存：第二次真的重新解析了（自愈）。
    assert.equal(resolved, 2)
  })
})
