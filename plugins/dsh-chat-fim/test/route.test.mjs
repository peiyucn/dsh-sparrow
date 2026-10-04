import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { apply } from '../lib/host.js'

/**
 * `/api/chat-fim/complete` 路由层的**真行为**用例：走真实的 `apply` → `ctx.webServer.register`
 * → handler，构造最小 req/res，断言状态码与响应体。
 *
 * 为什么要有这个文件：此前本插件的路由**零覆盖**，接线证据只有 `trust.test.mjs` 里
 * `readFileSync` + `indexOf` 比对源码字符位置那一类断言 —— 那种守卫「改注释就红、改行为不红」，
 * 栅栏被搬到处理器下游、或某条错误分支被删掉，它都照样绿。这里改成真调 handler。
 *
 * 上游是**注入的 fetch 桩**（`globalThis.fetch` 只在单次 dispatch 期间替换），不打真网络。
 */

const ROUTE = '/api/chat-fim/complete'
const LOOPBACK_HEADERS = { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' }

/**
 * 每次 harness 一个独立会话 id：诊断计数是**进程级**的，同 id 会跨用例累加，
 * 断言 `empty` / `retries` 这类计数时必须彼此隔离。
 */
let sessionCounter = 0
const nextSessionId = () => `route-test-session-${++sessionCounter}`

/**
 * 造一个满足请求入口所需最小面的会话对象。
 * @param overrides - 覆盖字段（如 `header.version` 模拟宿主格式不匹配）。
 */
function fakeSession(overrides = {}) {
  return {
    // 宿主真值格式门读它：官方 rc.2 的 SESSION_FORMAT_VERSION = 4。
    header: { version: 4 },
    requestHeader: () => undefined,
    deriveMessages: () => [],
    ...overrides,
  }
}

/**
 * 用最小 mock ctx 跑真实 `apply`，拿回注册的 exact handler。
 * @param options - 会话桩 / 凭据桩 / 额外 ctx 面 / 插件配置。
 */
async function buildHarness(options = {}) {
  const { sessionId = nextSessionId(), session = fakeSession(), config } = options
  let handler = null
  const registered = []
  const warnings = []
  const credentialsResolved = []
  const ctx = {
    webServer: { register: (route) => { handler = route.handler; registered.push(route); return () => {} } },
    sessions: { get: (id) => (String(id) === sessionId ? session : undefined) },
    credentials: {
      resolve: async (ref) => {
        credentialsResolved.push(String(ref))
        return 'credential' in options ? options.credential : { value: 'dummy-key' }
      },
    },
    logger: { warn: (message) => { warnings.push(message) }, error: () => {}, info: () => {} },
    effect: (fn) => { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {} },
    // 官方可选服务面（sessionProjections / agentDefaultModel / webRuntime）默认缺席。
    get: (name) => options.services?.[name],
  }
  await apply(ctx, config)
  return {
    registered,
    warnings,
    credentialsResolved,
    sessionId,
    get handler() { return handler },
  }
}

/** 把上游 JSON 造成一个真的 `Response`（handler 读 body 流 + status）。 */
function jsonResponse(payload, { status = 200 } = {}) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
}

/** 一次上游 200 补全响应。 */
function completionResponse(text, usage = { prompt_tokens: 12, completion_tokens: 3 }) {
  return jsonResponse({ choices: [{ text }], usage })
}

/**
 * 最小 req 桩：handler 只用到 method / url / headers，POST 时按异步可迭代读 body。
 * `stats.bodyReads` 记「请求体被读过没有」——栅栏若排在读体之后，这个计数就会涨。
 */
function makeReq({ method = 'POST', url = ROUTE, headers = LOOPBACK_HEADERS, body = '' } = {}) {
  const stats = { bodyReads: 0 }
  const req = {
    method,
    url,
    headers,
    async *[Symbol.asyncIterator]() {
      stats.bodyReads++
      if (body !== '') yield Buffer.from(body, 'utf8')
    },
  }
  return { req, stats }
}

/** 最小 res 桩：记录 statusCode / 响应头 / 响应体，支持 `once|off('close')` 与 `destroy()`。 */
function makeRes() {
  const headers = {}
  const chunks = []
  const listeners = new Map()
  let statusCode = 0
  let destroyed = false
  const res = {
    get headersSent() { return chunks.length > 0 },
    get destroyed() { return destroyed },
    setHeader: (name, value) => { headers[String(name).toLowerCase()] = value },
    getHeader: (name) => headers[String(name).toLowerCase()],
    end: (chunk) => { if (chunk !== undefined) chunks.push(String(chunk)) },
    once: (event, listener) => { listeners.set(event, [...(listeners.get(event) ?? []), listener]) },
    off: (event, listener) => { listeners.set(event, (listeners.get(event) ?? []).filter(entry => entry !== listener)) },
    emit: (event) => { for (const listener of [...(listeners.get(event) ?? [])]) listener() },
    destroy: () => { destroyed = true; res.emit('close') },
  }
  Object.defineProperty(res, 'statusCode', { get: () => statusCode, set: (value) => { statusCode = value } })
  return { res, headers, chunks, get destroyed() { return destroyed } }
}

/**
 * 真调一次 handler。
 * @param handler - `apply` 注册的 exact handler。
 * @param init - 请求形态（method / url / headers / body）。
 * @param fetchImpl - 本次 dispatch 期间替换的 `globalThis.fetch` 桩。
 */
async function dispatch(handler, init = {}, fetchImpl) {
  const { req, stats } = makeReq(init)
  const { res, headers, chunks } = makeRes()
  const originalFetch = globalThis.fetch
  const calls = []
  if (fetchImpl !== undefined) {
    globalThis.fetch = async (url, options) => {
      calls.push({ url: String(url), options, body: options?.body === undefined ? undefined : JSON.parse(options.body) })
      return fetchImpl(url, options)
    }
  }
  try {
    await handler(req, res)
  } finally {
    if (fetchImpl !== undefined) globalThis.fetch = originalFetch
  }
  const text = chunks.join('')
  return {
    statusCode: res.statusCode,
    headers,
    destroyed: res.destroyed,
    bodyReads: stats.bodyReads,
    calls,
    raw: text,
    body: text === '' ? undefined : JSON.parse(text),
  }
}

/** 从诊断路由读出当前计数（无用户内容，可安全断言）。 */
async function readDiagnostics(harness) {
  const result = await dispatch(harness.handler, { method: 'GET', url: `${ROUTE}?diagnostics=1` })
  assert.equal(result.statusCode, 200, '诊断路由必须放行同源请求')
  return result.body
}

describe('chat-fim host 路由：信任栅栏（DNS rebinding / CSRF）', () => {
  it('⛔ rebinding：Host 与 Origin 同为攻击者域名 应该 403（且不读 body、不调上游、不取凭据）', async () => {
    const h = await buildHarness()
    const result = await dispatch(h.handler, {
      body: JSON.stringify({ sessionId: h.sessionId, prompt: '帮我看看这个' }),
      headers: { host: 'evil.example:3080', origin: 'http://evil.example:3080' },
    }, () => completionResponse('不该被调用'))
    assert.equal(result.statusCode, 403)
    assert.equal(result.body.error.code, 'FORBIDDEN')
    assert.equal(result.bodyReads, 0, '栅栏必须排在读请求体之前')
    assert.equal(result.calls.length, 0, '被拒的请求不得触达上游（POST 会以服务端 key 计费）')
    assert.deepEqual(h.credentialsResolved, [], '被拒的请求不得去解析凭据')
  })

  it('⛔ rebinding：只有攻击者 Host、无 Origin（浏览器图片式读取）应该 403', async () => {
    const h = await buildHarness()
    const result = await dispatch(h.handler, { method: 'GET', url: `${ROUTE}?diagnostics=1`, headers: { host: 'evil.example:3080' } })
    assert.equal(result.statusCode, 403)
    assert.equal(result.body.error.code, 'FORBIDDEN')
  })

  it('⛔ 跨站 Origin 应该 403（Host 是回环也拒）', async () => {
    const h = await buildHarness()
    const result = await dispatch(h.handler, { method: 'GET', url: `${ROUTE}?diagnostics=1`, headers: { host: '127.0.0.1:3080', origin: 'http://evil.example' } })
    assert.equal(result.statusCode, 403)
  })

  it('⛔ sec-fetch-site: cross-site 应该 403（即使带同源 Origin）', async () => {
    const h = await buildHarness()
    const result = await dispatch(h.handler, { method: 'GET', url: `${ROUTE}?diagnostics=1`, headers: { ...LOOPBACK_HEADERS, 'sec-fetch-site': 'cross-site' } })
    assert.equal(result.statusCode, 403)
  })

  it('⛔ 缺 Host 头 应该 403', async () => {
    const h = await buildHarness()
    const result = await dispatch(h.handler, { method: 'GET', url: `${ROUTE}?diagnostics=1`, headers: {} })
    assert.equal(result.statusCode, 403)
  })

  it('⛔ GET 与 POST 都被同一道栅栏挡住（栅栏排在方法分发之前）', async () => {
    const h = await buildHarness()
    for (const method of ['GET', 'POST']) {
      const result = await dispatch(h.handler, { method, headers: { host: 'evil.example:3080' } })
      assert.equal(result.statusCode, 403, `${method} 必须被拒`)
      assert.equal(result.body.error.code, 'FORBIDDEN')
    }
  })

  it('官方 webRuntime 列出 LAN authority：列了的放行，没列的仍 403', async () => {
    const lanHeaders = { host: '192.168.1.5:3080', origin: 'http://192.168.1.5:3080' }
    const allowed = await buildHarness({ services: { webRuntime: { trustedHosts: ['192.168.1.5'] } } })
    const ok = await dispatch(allowed.handler, { method: 'GET', url: `${ROUTE}?diagnostics=1`, headers: lanHeaders })
    assert.equal(ok.statusCode, 200, '官方信任面列出的 LAN authority 必须放行')

    const denied = await buildHarness()
    const bad = await dispatch(denied.handler, { method: 'GET', url: `${ROUTE}?diagnostics=1`, headers: lanHeaders })
    assert.equal(bad.statusCode, 403, '官方信任面缺席时未列的 LAN authority 必须拒')
  })

  it('官方信任面形状畸形（trustedHosts 非数组）应该 保守回退为只信回环，不抛穿', async () => {
    const h = await buildHarness({ services: { webRuntime: { trustedHosts: 'not-an-array' } } })
    const result = await dispatch(h.handler, { method: 'GET', url: `${ROUTE}?diagnostics=1`, headers: { host: '192.168.1.5:3080', origin: 'http://192.168.1.5:3080' } })
    assert.equal(result.statusCode, 403)
  })
})

describe('chat-fim host 路由：GET 状态查询', () => {
  it('?diagnostics=1 应该 200 并给出护栏计数字段（不含用户内容）', async () => {
    const h = await buildHarness()
    const body = await readDiagnostics(h)
    for (const key of ['requests', 'fulfilled', 'retries', 'shown', 'empty', 'aborted', 'timeout', 'upstreamError']) {
      assert.equal(typeof body[key], 'number', `诊断字段 ${key} 必须是数字`)
    }
    assert.equal(typeof body.bySession, 'object')
    assert.equal(typeof body.elapsedTotalMs, 'number')
  })

  it('未知 sessionId 应该 404 UNKNOWN_SESSION', async () => {
    const h = await buildHarness()
    const result = await dispatch(h.handler, { method: 'GET', url: `${ROUTE}?sessionId=nope` })
    assert.equal(result.statusCode, 404)
    assert.equal(result.body.error.code, 'UNKNOWN_SESSION')
  })

  it('宿主会话格式不在支持集合（header.version=99）应该 200 { supported:false }', async () => {
    const h = await buildHarness({ session: fakeSession({ header: { version: 99 } }) })
    const result = await dispatch(h.handler, { method: 'GET', url: `${ROUTE}?sessionId=${h.sessionId}` })
    assert.equal(result.statusCode, 200)
    assert.deepEqual(result.body, { supported: false })
  })

  it('旧宿主缺 requestHeader / deriveMessages 应该 200 { supported:false }', async () => {
    const h = await buildHarness({ session: { header: { version: 4 } } })
    const result = await dispatch(h.handler, { method: 'GET', url: `${ROUTE}?sessionId=${h.sessionId}` })
    assert.equal(result.statusCode, 200)
    assert.deepEqual(result.body, { supported: false })
  })

  it('主模型为 deepseek-official 应该 supported:true；非 DeepSeek 应该 false', async () => {
    const deepseek = await buildHarness({
      session: fakeSession({ requestHeader: () => ({ config: { provider: 'deepseek-official', model: 'deepseek-flash' } }) }),
    })
    const yes = await dispatch(deepseek.handler, { method: 'GET', url: `${ROUTE}?sessionId=${deepseek.sessionId}` })
    assert.deepEqual(yes.body, { supported: true })

    const other = await buildHarness({
      session: fakeSession({ requestHeader: () => ({ config: { provider: 'openai', model: 'gpt' } }) }),
    })
    const no = await dispatch(other.handler, { method: 'GET', url: `${ROUTE}?sessionId=${other.sessionId}` })
    assert.deepEqual(no.body, { supported: false })
  })
})

describe('chat-fim host 路由：POST 错误路径', () => {
  it('非 GET/POST 方法 应该 405', async () => {
    const h = await buildHarness()
    const result = await dispatch(h.handler, { method: 'PUT', body: '{}' })
    assert.equal(result.statusCode, 405)
    assert.equal(result.body.error.code, 'BAD_BODY')
  })

  it('请求体不是合法 JSON 应该 400 BAD_BODY', async () => {
    const h = await buildHarness()
    const result = await dispatch(h.handler, { body: '{not json' })
    assert.equal(result.statusCode, 400)
    assert.equal(result.body.error.code, 'BAD_BODY')
  })

  it('缺 prompt 应该 400 INVALID_PROMPT', async () => {
    const h = await buildHarness()
    const result = await dispatch(h.handler, { body: JSON.stringify({ sessionId: h.sessionId }) })
    assert.equal(result.statusCode, 400)
    assert.equal(result.body.error.code, 'INVALID_PROMPT')
  })

  it('未知会话 应该 404 UNKNOWN_SESSION（不触达上游）', async () => {
    const h = await buildHarness()
    const result = await dispatch(h.handler, {
      body: JSON.stringify({ sessionId: 'nope', prompt: '帮我看看这个' }),
    }, () => completionResponse('不该被调用'))
    assert.equal(result.statusCode, 404)
    assert.equal(result.body.error.code, 'UNKNOWN_SESSION')
    assert.equal(result.calls.length, 0)
  })

  it('宿主会话格式不支持 应该 501 UNSUPPORTED_HOST_FORMAT（不发上游请求）', async () => {
    const h = await buildHarness({ session: fakeSession({ header: { version: 99 } }) })
    const result = await dispatch(h.handler, {
      body: JSON.stringify({ sessionId: h.sessionId, prompt: '帮我看看这个' }),
    }, () => completionResponse('不该被调用'))
    assert.equal(result.statusCode, 501)
    assert.equal(result.body.error.code, 'UNSUPPORTED_HOST_FORMAT')
    assert.equal(result.calls.length, 0)
  })

  it('旧宿主缺会话接口 应该 501 UNSUPPORTED_HOST（不发上游请求）', async () => {
    const h = await buildHarness({ session: { header: { version: 4 } } })
    const result = await dispatch(h.handler, {
      body: JSON.stringify({ sessionId: h.sessionId, prompt: '帮我看看这个' }),
    }, () => completionResponse('不该被调用'))
    assert.equal(result.statusCode, 501)
    assert.equal(result.body.error.code, 'UNSUPPORTED_HOST')
    assert.equal(result.calls.length, 0)
  })

  it('主模型非 DeepSeek 系列 应该 403 MODEL_UNSUPPORTED（不发上游请求）', async () => {
    const h = await buildHarness({
      session: fakeSession({ requestHeader: () => ({ config: { provider: 'openai', model: 'gpt' } }) }),
    })
    const result = await dispatch(h.handler, {
      body: JSON.stringify({ sessionId: h.sessionId, prompt: '帮我看看这个' }),
    }, () => completionResponse('不该被调用'))
    assert.equal(result.statusCode, 403)
    assert.equal(result.body.error.code, 'MODEL_UNSUPPORTED')
    assert.equal(result.calls.length, 0)
  })

  it('凭据缺失 应该 401 MISSING_CREDENTIAL（不发上游请求）', async () => {
    const h = await buildHarness({ credential: undefined })
    const result = await dispatch(h.handler, {
      body: JSON.stringify({ sessionId: h.sessionId, prompt: '帮我看看这个' }),
    }, () => completionResponse('不该被调用'))
    assert.equal(result.statusCode, 401)
    assert.equal(result.body.error.code, 'MISSING_CREDENTIAL')
    assert.equal(result.calls.length, 0)
  })

  it('上游 429 应该 502 RATE_LIMITED', async () => {
    const h = await buildHarness()
    const result = await dispatch(h.handler, {
      body: JSON.stringify({ sessionId: h.sessionId, prompt: '帮我看看这个' }),
    }, () => jsonResponse({ error: { message: 'rate limited' } }, { status: 429 }))
    assert.equal(result.statusCode, 502)
    assert.equal(result.body.error.code, 'RATE_LIMITED')
    // 「全失败」这条路同样不冒泡到 catch，故 upstreamError 必须在这里自己累加——否则该计数恒为 0。
    const sessionStats = (await readDiagnostics(h)).bySession[h.sessionId]
    assert.equal(sessionStats?.upstreamError, 1, '上游真报错必须计入 upstreamError 诊断')
  })

  it('上游返回非法 JSON 应该 502 UPSTREAM_ERROR', async () => {
    const h = await buildHarness()
    const result = await dispatch(h.handler, {
      body: JSON.stringify({ sessionId: h.sessionId, prompt: '帮我看看这个' }),
    }, () => new Response('<html>gateway</html>', { status: 200, headers: { 'content-type': 'application/json' } }))
    assert.equal(result.statusCode, 502)
    assert.equal(result.body.error.code, 'UPSTREAM_ERROR')
  })

  /**
   * 超时回归守卫（本条曾如实钉住缺陷行为，修复后改钉期望行为）。
   *
   * 历史上这里是红的：请求入口用 `Promise.allSettled` 吸收 `requestOnce` 的拒绝，
   * 超时的拒绝**不冒泡**到外层 `catch`，于是 `catch` 里的 504/TIMEOUT 分支成了死代码——
   * 实测（真 `fetch` + 指向一个永不响应的本机 server）返回的是 502 + body `{"error":{}}`，
   * 诊断 timeout 恒 0。修法见 `src/host.ts` 的 `abortedOutcome` 短路（先于正常出口判定）。
   *
   * 这条用例的价值在于**只有真跑 handler 才测得到**：源码里 504/TIMEOUT 的字样一直都在，
   * 任何「源码字符串断言」都看不出它不可达。
   */
  it('上游超时 应该 504 TIMEOUT，并累加 timeout 诊断计数', async () => {
    const h = await buildHarness({ config: { requestTimeoutMs: 10 } })
    const result = await dispatch(h.handler, {
      body: JSON.stringify({ sessionId: h.sessionId, prompt: '帮我看看这个' }),
    }, (_url, options) => new Promise((_resolve, reject) => {
      // fetch 在 signal 中止时以中止原因 reject —— 与真实 fetch 同口径（已实测）。
      options.signal.addEventListener('abort', () => reject(options.signal.reason))
    }))
    assert.equal(result.statusCode, 504, '超时必须走 504 出口，不得落进通用 502')
    assert.equal(result.body.error.code, 'TIMEOUT')
    assert.match(result.body.error.message, /超时/u, '错误体必须带可读 message（DOMException 会序列化成空对象）')
    const sessionStats = (await readDiagnostics(h)).bySession[h.sessionId]
    assert.equal(sessionStats?.timeout, 1, 'timeout 诊断计数必须真的累加（它是「转完圈没出卡片」的排查入口）')
    assert.equal(sessionStats?.upstreamError, 0, '超时不应当被记成上游报错')
  })

  /**
   * 客户端断开回归守卫（同上：曾钉缺陷行为，修复后改钉期望行为）。
   * 断开时不得写响应（避免悬挂），且 aborted 诊断计数要真的累加。
   */
  it('客户端中途断开 应该 destroy 响应、不写状态码，并累加 aborted 诊断计数', async () => {
    const h = await buildHarness()
    const { req } = makeReq({ body: JSON.stringify({ sessionId: h.sessionId, prompt: '帮我看看这个' }) })
    const { res } = makeRes()
    const originalFetch = globalThis.fetch
    globalThis.fetch = (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason))
    })
    try {
      const settled = Promise.resolve(h.handler(req, res))
      await new Promise(resolve => setTimeout(resolve, 5))
      res.destroy() // 浏览器「还在打字 / 切会话」作废了这次联想
      await settled
    } finally {
      globalThis.fetch = originalFetch
    }
    assert.equal(res.destroyed, true, '客户端断开后必须销毁响应，不留悬挂')
    assert.equal(res.statusCode, 0, '作废的请求不该再写状态码')
    const body = await readDiagnostics(h)
    assert.equal(body.bySession[h.sessionId]?.aborted, 1, 'aborted 诊断计数必须真的累加')
  })
})

describe('chat-fim host 路由：受信 POST 走通（上游为注入桩）', () => {
  it('受信请求 应该 200，并返回清洗后的单句建议 / 模型 / usage', async () => {
    const h = await buildHarness()
    const result = await dispatch(h.handler, {
      body: JSON.stringify({ sessionId: h.sessionId, prompt: '帮我看看这个' }),
    }, () => completionResponse('  这是建议。第二句应当被截掉  ', { prompt_tokens: 20, completion_tokens: 7 }))
    assert.equal(result.statusCode, 200)
    assert.deepEqual(result.body, {
      suggestions: ['这是建议。'],
      model: 'deepseek-flash',
      temperature: 0.3,
      usage: { promptTokens: 20, completionTokens: 7 },
    })
  })

  it('上游请求形态 应该 正确：URL 拼接、Bearer 凭据、prompt 含历史与草稿、停止序列', async () => {
    const h = await buildHarness({
      session: fakeSession({
        deriveMessages: () => [{ role: 'user', content: [{ type: 'text', text: '前一句用户消息' }] }],
      }),
    })
    const result = await dispatch(h.handler, {
      body: JSON.stringify({ sessionId: h.sessionId, prompt: '帮我看看这个' }),
    }, () => completionResponse('这是建议。'))
    assert.equal(result.statusCode, 200)
    assert.equal(result.calls.length, 1, 'suggestionCount=1 时只发一次上游请求')
    const call = result.calls[0]
    assert.equal(call.url, 'https://api.deepseek.com/beta/completions')
    assert.equal(call.options.method, 'POST')
    assert.equal(call.options.headers.authorization, 'Bearer dummy-key')
    assert.equal(call.body.model, 'deepseek-flash')
    assert.equal(call.body.max_tokens, 96)
    assert.equal(call.body.temperature, 0.3)
    assert.equal(call.body.prompt, '用户：前一句用户消息\n\n用户：帮我看看这个')
    assert.deepEqual(call.body.stop, ['\n用户：', '\n助手：'])
    assert.deepEqual(h.credentialsResolved, ['DEEPSEEK_API_KEY'])
  })

  it('建议全被回声护栏过滤（上游仍 200）应该 200 空数组，而不是报错', async () => {
    // 历史文本必须长于 15 字窗口，才会被 isHistoryEcho 命中（窗口不足 15 字直接放行）。
    const assistantText = '这是正在讨论的实现细节说明以及更多上下文'
    const h = await buildHarness({
      session: fakeSession({
        deriveMessages: () => [{ role: 'assistant', content: [{ type: 'text', text: assistantText }] }],
      }),
    })
    // 两条候选都是历史回声 → 清洗后为空 → 升温度重试一次 → 仍空 → 200 + 空建议
    const result = await dispatch(h.handler, {
      body: JSON.stringify({ sessionId: h.sessionId, prompt: '帮我看看这个' }),
    }, () => completionResponse(assistantText))
    assert.equal(result.statusCode, 200)
    assert.deepEqual(result.body.suggestions, [])
    assert.equal(result.calls.length, 2, '空候选应触发一次升温度重试')
    assert.equal(result.calls[1].body.temperature, 0.5, '重试使用 ECHO_RETRY_TEMPERATURE = 0.5')
    const sessionStats = (await readDiagnostics(h)).bySession[h.sessionId]
    assert.equal(sessionStats?.empty, 1)
    assert.equal(sessionStats?.retries, 1)
    assert.equal(sessionStats?.filteredEcho, 2, '两条候选都被回声护栏丢弃')
  })

  it('suggestionCount>1 应该 并行发多次请求且温度错开（0.4 步长，上限 2）', async () => {
    const h = await buildHarness({ config: { suggestionCount: 3, temperature: 1.5 } })
    const result = await dispatch(h.handler, {
      body: JSON.stringify({ sessionId: h.sessionId, prompt: '帮我看看这个' }),
    }, (_url, options) => {
      const request = JSON.parse(options.body)
      return completionResponse(`建议内容${request.temperature}句。`)
    })
    assert.equal(result.statusCode, 200)
    assert.deepEqual(result.calls.map(call => call.body.temperature), [1.5, 1.9, 2], '温度错开且封顶 2')
    // 首条建议的温度进响应（absorb 用第一条成功结果）
    assert.equal(result.body.temperature, 1.5)
    assert.equal(result.body.suggestions.length, 3)
  })

  /**
   * 「一个请求超时、另一个已拿到候选」：必须 200 保留到手候选，不得误报 504。
   *
   * 这条是修复过程中真踩到的坑：第一版把超时判定放在**正常出口之前**，结果
   * suggestionCount>1 时只要有任一请求超时（哪怕兄弟请求已经返回候选）就走 504，
   * 把到手候选丢掉——违反「部分失败保留成功建议」。故超时判定必须放在
   * 「零候选且零 fulfilled」之后。这条用例钉住该次序。
   */
  it('部分成功 + 另一路超时 应该 200 保留到手候选，不得误报 504', async () => {
    const h = await buildHarness({ config: { suggestionCount: 2, requestTimeoutMs: 20 } })
    let call = 0
    const result = await dispatch(h.handler, {
      body: JSON.stringify({ sessionId: h.sessionId, prompt: '帮我看看这个' }),
    }, (_url, options) => {
      call++
      if (call === 1) return Promise.resolve(completionResponse('先到手的建议。多余'))
      // 第二个请求挂住，直到本次请求的信号被超时中止
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason))
      })
    })
    assert.equal(result.statusCode, 200, '有候选就必须 200，不得因为兄弟请求超时改判 504')
    assert.deepEqual(result.body.suggestions, ['先到手的建议。'], '到手的候选不得被丢掉')
    const sessionStats = (await readDiagnostics(h)).bySession[h.sessionId]
    assert.equal(sessionStats?.shown, 1)
    assert.equal(sessionStats?.timeout, 0, '有候选时不算「超时无结果」')
  })
})
