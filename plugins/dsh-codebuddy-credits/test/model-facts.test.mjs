// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createModelFacts } from '../lib/host/models.js'
import { CONFIG_URL } from '../lib/constants.js'

/** 模型事实仓的 `ready()`：事实为空时等目录落定，已就绪立即返回，拉取失败 fail-soft 保持为空。 */

const originalFetch = globalThis.fetch

const STORE_BODY = {
  code: 0,
  data: {
    agents: [{ name: 'cli', models: ['m'] }],
    models: [{ id: 'm', name: 'M', maxInputTokens: 1000, maxOutputTokens: 100, supportsImages: true }],
  },
}

/**
 * 替换全局 fetch：记录调用次数；`fail` 时抛网络错误（模拟目录拉取失败）。
 * @param {{ fail?: boolean }} [options] - 桩行为。
 * @returns {{ calls: number }} 可观察状态。
 */
function stubStore(options = {}) {
  const state = { calls: 0 }
  globalThis.fetch = async (url) => {
    state.calls += 1
    assert.equal(String(url), CONFIG_URL)
    if (options.fail === true) throw new Error('network down')
    return new Response(JSON.stringify(STORE_BODY), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return state
}

/** 最小可用的模型事实仓（ctx 只用到 logger.warn）。 */
function makeStore() {
  return createModelFacts({
    ctx: /** @type {any} */ ({ logger: { warn() {} } }),
    name: 'test',
    resolveApiKey: async () => 'key',
    generation: () => 0,
    account: () => undefined,
  })
}

describe('模型事实仓 ready()', () => {
  it('事实为空时触发目录拉取并在落定后返回', async () => {
    const state = stubStore()
    try {
      const store = makeStore()
      await store.ready(1_000)
      assert.equal(state.calls, 1, '空事实应该拉一次目录')
      assert.equal(store.list().length, 1)
      assert.deepEqual(store.list()[0].input, ['text', 'image'])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('已就绪时立即返回，不再拉目录', async () => {
    const state = stubStore()
    try {
      const store = makeStore()
      await store.ready(1_000)
      await store.ready(1_000)
      assert.equal(state.calls, 1, '已有事实不得重复拉目录')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('拉取失败时按时返回、事实保持为空（fail-soft）', async () => {
    const state = stubStore({ fail: true })
    try {
      const store = makeStore()
      await store.ready(200)
      assert.equal(state.calls, 1)
      assert.equal(store.list().length, 0, '失败不得伪造事实')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
