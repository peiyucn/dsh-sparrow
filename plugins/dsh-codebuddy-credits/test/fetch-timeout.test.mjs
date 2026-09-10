import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CLIENT_ACTION_TIMEOUT_MS, CLIENT_FETCH_TIMEOUT_MS, fetchLocal } from '../lib/client/fetch-timeout.js'

/** 用可恢复的 fetch 桩观察 init（Node 22 原生 fetch/Response 语义）。 */
async function withFetchStub(run) {
  const original = globalThis.fetch
  let seen
  globalThis.fetch = async (_input, init) => {
    seen = init
    return new Response('ok')
  }
  try {
    await run(() => seen)
  } finally {
    globalThis.fetch = original
  }
}

describe('fetchLocal（客户端请求超时兜底）', () => {
  it('无 signal 应该注入 AbortSignal.timeout（默认 15s）', async () => {
    assert.equal(CLIENT_FETCH_TIMEOUT_MS, 15_000)
    await withFetchStub(async (seen) => {
      await fetchLocal('/x')
      assert.ok(seen().signal instanceof AbortSignal)
    })
  })

  it('调用方自带 signal 应该原样尊重（不覆盖）', async () => {
    const controller = new AbortController()
    await withFetchStub(async (seen) => {
      await fetchLocal('/x', { signal: controller.signal })
      assert.equal(seen().signal, controller.signal)
    })
  })

  it('动作类超时 30s 应该可显式传入', async () => {
    assert.equal(CLIENT_ACTION_TIMEOUT_MS, 30_000)
    await withFetchStub(async (seen) => {
      await fetchLocal('/x', {}, CLIENT_ACTION_TIMEOUT_MS)
      assert.ok(seen().signal instanceof AbortSignal)
    })
  })
})