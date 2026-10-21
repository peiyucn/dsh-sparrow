// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fetchQuota } from '../lib/quota.js'
import { QUOTA_URL } from '../lib/constants.js'

/** Node 原生 fetch 存档：每个用例把 `globalThis.fetch` 换成桩，结束必须还原——写成 `undefined` 既
 *  不符合 `typeof fetch` 的类型契约，也会把宿主全局真的抹掉。 */
const originalFetch = globalThis.fetch

describe('fetchQuota', () => {
  it('解析实测配额形状（credit/limitNum/周期时间，剩余 = 额度 - 已用）', async () => {
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), QUOTA_URL)
      assert.equal(init.method, 'POST')
      assert.equal(init.headers['x-api-key'], 'test-key')
      assert.equal(init.headers['x-enterprise-id'], 'e1')
      return new Response(JSON.stringify({
        code: 0,
        data: {
          credit: 123.5,
          limitNum: 2000,
          cycleStartTime: '2026-09-01 00:00:00',
          cycleEndTime: '2026-09-30 23:59:59',
          cycleResetTime: '2026-10-01 00:00:00',
        },
      }), { status: 200 })
    }
    try {
      const quota = await fetchQuota('test-key', { userId: 'u1', enterpriseId: 'e1' })
      assert.deepEqual(quota, {
        used: 123.5,
        limit: 2000,
        remaining: 1876.5,
        cycleStart: '2026-09-01 00:00:00',
        cycleEnd: '2026-09-30 23:59:59',
        resetAt: '2026-10-01 00:00:00',
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('已用超额度时剩余钳制为非负', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ code: 0, data: { credit: 2500, limitNum: 2000 } }), { status: 200 })
    try {
      const quota = await fetchQuota('k')
      assert.equal(quota.remaining, 0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('缺失字段取安全默认（credit/limitNum 缺省为 0，无周期时间不携带）', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ code: 0, data: {} }), { status: 200 })
    try {
      const quota = await fetchQuota('k')
      assert.deepEqual(quota, { used: 0, limit: 0, remaining: 0 })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('服务端业务错误透传文案', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ code: 400, msg: 'no permission' }), { status: 200 })
    try {
      await assert.rejects(
        fetchQuota('k'),
        /** @param {any} error */ (error) => error.code === 'PROVIDER' && /no permission/.test(error.message),
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('HTTP 错误抛出 PROVIDER 错误', async () => {
    globalThis.fetch = async () => new Response('{}', { status: 403 })
    try {
      await assert.rejects(
        fetchQuota('k'),
        /** @param {any} error */ (error) => error.code === 'PROVIDER' && /HTTP 403/.test(error.message),
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('响应体无法解析时抛出 PROVIDER 错误', async () => {
    globalThis.fetch = async () => new Response('{broken', { status: 200 })
    try {
      await assert.rejects(fetchQuota('k'), /** @param {any} error */ (error) => error.code === 'PROVIDER')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('调用方 signal 已中止：立即抛出中止原因，不发请求', async () => {
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    let called = false
    globalThis.fetch = async () => { called = true; throw new Error('should not fetch') }
    try {
      await assert.rejects(fetchQuota('k', undefined, controller.signal), /cancelled/)
      assert.equal(called, false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('请求中途被取消 → ABORTED', async () => {
    const controller = new AbortController()
    globalThis.fetch = async (_url, init) => {
      await new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
        queueMicrotask(() => controller.abort(new Error('user cancel')))
      })
      // 桩只在 abort 时 settle：正常返回即行为回归，显式失败（也让返回值满足 fetch 的类型契约）。
      throw new Error('fetch 桩不应正常返回')
    }
    try {
      await assert.rejects(fetchQuota('k', undefined, controller.signal), /** @param {any} error */ (error) => error.code === 'ABORTED')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
