// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { apply, inject, name } from '../lib/index.js'

/**
 * host half 的 apply 守卫：
 * - 缺能力 → 抛「已停用」错误（cordis 逐插件捕获并标 inactive，宿主与其余插件不受影响）；
 * - 重复挂载（DUPLICATE_*）→ 只告警、不抛、不清理他插件。
 * 用最小 fake ctx 走到真实 apply；不触网（凭据解析故意返回 undefined）。
 */

/** 可配置的 fake 宿主上下文；`launchKey` 为真时模拟环境变量里有 Key。 */
function fakeHost({ llm = {}, launchKey = false } = {}) {
  const warns = []
  const ctx = {
    logger: { warn: (/** @type {unknown} */ message) => { warns.push(String(message)) } },
    llm: {
      registerAdapter: () => ({ replace: () => {} }),
      registerConfigurableProviders: () => ({ replace: () => {} }),
      registerModelDiscovery: () => () => {},
      ...llm,
    },
    attachments: {},
    sessions: { get: () => undefined },
    /** 凭据服务存在但解析不到 Key：apply 的异步后半段会立即 return，不产生网络请求。 */
    get: (/** @type {string} */ service) => {
      if (service === 'launchEnvironment') {
        return { get: () => (launchKey ? { value: 'env-key' } : undefined) }
      }
      if (service === 'credentials') return { resolve: async () => undefined }
      return undefined
    },
    /** 可选依赖 fork 不在本测试范围：记录申请但不执行回调。 */
    inject: () => {},
  }
  return { ctx, warns }
}

const CONFIG = {
  apiKeyEnv: { get: () => 'CODEBUDDY_CREDITS_API_KEY' },
  maxMode: { get: () => false },
}

/** 官方注册 API 的冲突错误形状（LlmError 带 code）。 */
function duplicate(code) {
  const error = new Error(`an adapter for provider "codebuddy-credits" is already registered`)
  return Object.assign(error, { code })
}

describe('host apply：缺能力 → 只停用（抛错由 cordis 兜住）', () => {
  it('缺 llm.registerAdapter 应该 告警并抛「已停用」，不注册任何东西', () => {
    const { ctx, warns } = fakeHost({ llm: { registerAdapter: undefined } })
    let registered = 0
    ctx.llm.registerConfigurableProviders = () => { registered += 1; return { replace: () => {} } }
    assert.throws(() => { apply(ctx, CONFIG) }, /llm\.registerAdapter/u)
    assert.equal(registered, 0, '能力门先于任何注册')
    assert.equal(warns.length, 1)
    assert.match(warns[0], /已停用插件以免影响 dsh/u)
  })

  it('缺 llm.registerModelDiscovery 应该 同样停用（探针只列真实调用的方法）', () => {
    const { ctx } = fakeHost({ llm: { registerModelDiscovery: undefined } })
    assert.throws(() => { apply(ctx, CONFIG) }, /llm\.registerModelDiscovery/u)
  })

  it('入口契约：name / inject 稳定', () => {
    assert.equal(name, 'llm-codebuddy-credits')
    assert.deepEqual(inject, ['llm', 'attachments', 'sessions'])
  })
})

describe('host apply：重复挂载 → DUPLICATE_* 明确告警而不是裸抛', () => {
  it('三处注册都被他插件占用时 应该 不抛、逐条给出 DUPLICATE 文案', () => {
    const { ctx, warns } = fakeHost({
      launchKey: true,
      llm: {
        registerConfigurableProviders: () => { throw duplicate('DUPLICATE_DIRECTORY') },
        registerModelDiscovery: () => { throw duplicate('DUPLICATE_DISCOVERY') },
        registerAdapter: () => { throw duplicate('DUPLICATE_ADAPTER') },
      },
    })
    assert.doesNotThrow(() => { apply(ctx, CONFIG) })
    const text = warns.join('\n')
    for (const code of ['DUPLICATE_DIRECTORY', 'DUPLICATE_DISCOVERY', 'DUPLICATE_ADAPTER']) {
      assert.match(text, new RegExp(code, 'u'), `缺少 ${code} 的明确告警`)
    }
    assert.match(text, /不会清理其他插件的注册/u)
  })
})
