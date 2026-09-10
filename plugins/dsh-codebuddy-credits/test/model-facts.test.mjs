import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PROVIDER_ID, getModelFacts, subscribeModelFacts, syncModelFacts } from '../lib/client/model-facts.js'

describe('model-facts（客户端共享模型事实表）', () => {
  it('PROVIDER_ID 应该 与 host provider 路由一致', () => {
    assert.equal(PROVIDER_ID, 'codebuddy-credits')
  })

  it('syncModelFacts 应该 按模型 id 建表且快照可读', () => {
    syncModelFacts([
      { id: 'a', name: 'A', credits: 'x0.79', vision: true, contextWindow: 1_000_000, maxTokens: 32_000 },
    ])
    assert.equal(getModelFacts().get('a')?.name, 'A')
    assert.equal(getModelFacts().get('a')?.credits, 'x0.79')
  })

  it('订阅者 应该 在 sync 时收到通知，退订后不再收到', () => {
    let hits = 0
    const off = subscribeModelFacts(() => { hits += 1 })
    syncModelFacts([])
    assert.equal(hits, 1)
    off()
    syncModelFacts([])
    assert.equal(hits, 1)
  })

  it('sync 空清单 应该 清空事实表', () => {
    syncModelFacts([])
    assert.equal(getModelFacts().size, 0)
  })
})