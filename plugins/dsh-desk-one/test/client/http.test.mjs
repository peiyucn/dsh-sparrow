// @ts-check
/**
 * Shared browser transport contract: every feature uses one implementation, and a timeout surfaces as
 * `HttpError(0, …)` so the UI shows a user-facing message instead of an English `DOMException`.
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { fetchJson, HttpError, postJson } from '../../lib/client/http.js'
import { sync as scheduleSync } from '../../lib/client/schedule/api.js'

/**
 * Test-facing call shape: `init` / `options` are optional in the shared declaration, but the built `lib/`
 * JS infers tagged JSDoc parameters as required. Route the test calls through this typed alias instead.
 * @param {string} path
 * @param {RequestInit} [init]
 * @param {{ timeoutMs?: number, timeoutMessage?: string }} [options]
 * @returns {Promise<any>}
 */
const requestJson = (path, init, options) => fetchJson(path, init, options)

/**
 * Capture fetch calls and delegate each one to a per-case handler.
 * @param {(options: any) => Promise<Response>} handler
 */
function stubFetch(handler) {
  /** @type {Array<{ url: string, options: any }>} */
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options })
    return await handler(options)
  }
  return { calls, restore: () => { globalThis.fetch = original } }
}

/** Reject exactly like a real fetch does when its timeout signal fires. */
const rejectOnAbort = options => new Promise((_resolve, reject) => {
  options.signal.addEventListener('abort', () => reject(options.signal.reason))
})

/** Run one call and return whatever it rejected with (fails the test if it resolves). */
async function rejectionOf(run) {
  try {
    await run()
  } catch (error) {
    return error
  }
  assert.fail('预期请求失败，实际成功')
}

const restores = []
afterEach(() => {
  for (const restore of restores.splice(0)) restore()
})

describe('共享客户端传输', () => {
  it('超时抛 HttpError(status 0)，消息取调用方文案', async () => {
    const stub = stubFetch(rejectOnAbort)
    restores.push(stub.restore)
    const error = await rejectionOf(() => requestJson('/api/desk-one/notes', undefined, { timeoutMs: 5, timeoutMessage: '自定义超时文案' }))
    assert.ok(error instanceof HttpError)
    assert.equal(error.status, 0)
    assert.equal(error.message, '自定义超时文案')
  })

  it('未给文案时用共享默认超时文案', async () => {
    const stub = stubFetch(rejectOnAbort)
    restores.push(stub.restore)
    const error = await rejectionOf(() => requestJson('/api/desk-one/tasks', undefined, { timeoutMs: 5 }))
    assert.ok(error instanceof HttpError)
    assert.equal(error.status, 0)
    assert.match(error.message, /^请求超时/u)
  })

  it('日程的同步超时文案逐字保留', async () => {
    const stub = stubFetch(() => Promise.reject(new DOMException('timed out', 'TimeoutError')))
    restores.push(stub.restore)
    const error = await rejectionOf(() => scheduleSync())
    assert.ok(error instanceof HttpError)
    assert.equal(error.status, 0)
    assert.equal(error.message, '请求超时：同步可能仍在后台继续，稍后点「同步」或重新打开日程查看')
  })

  it('调用方的 signal 不被覆盖，其 abort 原样透传', async () => {
    const stub = stubFetch(rejectOnAbort)
    restores.push(stub.restore)
    const controller = new AbortController()
    const pending = requestJson('/api/desk-one/tasks', { signal: controller.signal })
    assert.equal(stub.calls[0]?.options.signal, controller.signal)
    controller.abort()
    const error = await rejectionOf(() => pending)
    assert.ok(error instanceof DOMException)
    assert.equal(error.name, 'AbortError')
    assert.equal(error instanceof HttpError, false)
  })

  it('非 2xx 透传服务端 message（保留 status 供 409 分支判断）', async () => {
    const stub = stubFetch(() => Promise.resolve(new Response(
      JSON.stringify({ error: { code: 'CONFLICT', message: '版本冲突，请刷新后重试' } }),
      { status: 409, headers: { 'content-type': 'application/json' } },
    )))
    restores.push(stub.restore)
    const error = await rejectionOf(() => requestJson('/api/desk-one/tasks'))
    assert.ok(error instanceof HttpError)
    assert.equal(error.status, 409)
    assert.equal(error.message, '版本冲突，请刷新后重试')
  })

  it('非 JSON 响应说明 HTTP 状态与正文片段', async () => {
    const stub = stubFetch(() => Promise.resolve(new Response('<html>bad gateway</html>', { status: 502 })))
    restores.push(stub.restore)
    const error = await rejectionOf(() => requestJson('/api/desk-one/tasks'))
    assert.ok(error instanceof HttpError)
    assert.equal(error.status, 502)
    assert.equal(error.message, '请求失败（HTTP 502）：<html>bad gateway</html>')
  })

  it('postJson 仍以 JSON 发送 POST 请求体', async () => {
    const stub = stubFetch(() => Promise.resolve(new Response('{"ok":true}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })))
    restores.push(stub.restore)
    const payload = await postJson('/api/desk-one/notes', { title: '示例' })
    assert.deepEqual(payload, { ok: true })
    assert.equal(stub.calls[0]?.url, '/api/desk-one/notes')
    assert.equal(stub.calls[0]?.options.method, 'POST')
    assert.equal(stub.calls[0]?.options.headers['content-type'], 'application/json')
    assert.deepEqual(JSON.parse(stub.calls[0]?.options.body), { title: '示例' })
  })
})
