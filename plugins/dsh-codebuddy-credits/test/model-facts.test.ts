
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createModelFacts } from '../lib/host/models.js'
import { CONFIG_URL } from '../lib/constants.js'



const originalFetch = globalThis.fetch

const STORE_BODY = {
  code: 0,
  data: {
    agents: [{ name: 'cli', models: ['m'] }],
    models: [{ id: 'm', name: 'M', maxInputTokens: 1000, maxOutputTokens: 100, supportsImages: true }],
  },
}


function stubStore(options: { fail?: boolean } = {}) {
  const state = { calls: 0 }
  globalThis.fetch = async (url) => {
    state.calls += 1
    assert.equal(String(url), CONFIG_URL)
    if (options.fail === true) throw new Error('network down')
    return new Response(JSON.stringify(STORE_BODY), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return state
}


function makeStore() {
  return createModelFacts({
    ctx:  ({ logger: { warn() {} } }),
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
