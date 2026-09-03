import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { currentMainModel } from '../lib/host.js'

/** 构造最小 ctx：只有 currentMainModel 会读到的两个服务槽。 */
function fakeCtx({ projections, defaultModel }) {
  return {
    get(key) {
      if (key === 'sessionProjections') return projections
      if (key === 'agentDefaultModel') return defaultModel
      return undefined
    },
  }
}

function fakeSession(events = []) {
  return { snapshotEvents: () => events }
}

const DEFAULT_MODEL = { provider: 'deepseek-official', model: 'deepseek-v4-pro' }
const REQUEST_EVENT = {
  type: 'request/header',
  data: { header: { config: { provider: 'deepseek-official', model: 'deepseek-v4-flash' } } },
}

describe('currentMainModel（状态路由模型判定）', () => {
  it('会话未装载（undefined） 应该 回退共享默认模型——历史加载前图标立即有判定', () => {
    const ctx = fakeCtx({ projections: undefined, defaultModel: { currentSelection: () => DEFAULT_MODEL } })
    assert.deepEqual(currentMainModel(ctx, undefined), DEFAULT_MODEL)
  })

  it('会话未装载且无默认模型 应该 返回 undefined（图标隐藏）', () => {
    const ctx = fakeCtx({ projections: undefined, defaultModel: undefined })
    assert.equal(currentMainModel(ctx, undefined), undefined)
  })

  it('投影 pending 选择 应该 优先于事件与默认模型', () => {
    const projections = { stateOf: () => ({ pending: { provider: 'deepseek-official', model: 'deepseek-v4-pro' }, lastUsed: null }) }
    const ctx = fakeCtx({ projections, defaultModel: { currentSelection: () => DEFAULT_MODEL } })
    assert.deepEqual(currentMainModel(ctx, fakeSession([REQUEST_EVENT])), { provider: 'deepseek-official', model: 'deepseek-v4-pro' })
  })

  it('无投影 应该 从最近 request/header 事件取主模型', () => {
    const ctx = fakeCtx({ projections: undefined, defaultModel: { currentSelection: () => DEFAULT_MODEL } })
    assert.deepEqual(currentMainModel(ctx, fakeSession([REQUEST_EVENT])), { provider: 'deepseek-official', model: 'deepseek-v4-flash' })
  })

  it('投影读取抛错 应该 回退事件而不是抛给调用方', () => {
    const projections = { stateOf: () => { throw new Error('boom') } }
    const ctx = fakeCtx({ projections, defaultModel: undefined })
    assert.deepEqual(currentMainModel(ctx, fakeSession([REQUEST_EVENT])), { provider: 'deepseek-official', model: 'deepseek-v4-flash' })
  })

  it('会话无事件且无投影 应该 回退共享默认模型', () => {
    const ctx = fakeCtx({ projections: undefined, defaultModel: { currentSelection: () => DEFAULT_MODEL } })
    assert.deepEqual(currentMainModel(ctx, fakeSession([])), DEFAULT_MODEL)
  })
})
