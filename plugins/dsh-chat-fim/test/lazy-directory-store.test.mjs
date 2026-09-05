import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createLazyDirectoryStore } from '../lib/client/lazy-directory-store.js'

/** 模拟官方 modelDirectories 目录 store：快照 + 订阅 + 主动变更。 */
function makeStore(initial) {
  let current = initial
  const listeners = new Set()
  return {
    getSnapshot: () => ({ current }),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setCurrent: (next) => {
      current = next
      for (const listener of listeners) listener()
    },
    listenerCount: () => listeners.size,
  }
}

describe('createLazyDirectoryStore 目录 store 惰性订阅', () => {
  it('scope 未就绪（抛错）应该 保持未决、快照为 null', () => {
    const hit = makeStore({ provider: 'p', model: 'm' })
    const adapter = createLazyDirectoryStore(() => {
      throw new Error('会话 scope 未就绪')
    }, 's1')
    assert.equal(adapter.getSnapshot(), null)
    assert.equal(adapter.getSnapshot(), null) // 每次读取重试，不挂死
    assert.equal(hit.listenerCount(), 0)
  })

  it('未决订阅在解析时应该 迁移到真实 store 并立即通知', () => {
    let ready = false
    const hit = makeStore({ provider: 'deepseek-official', model: 'deepseek-v4-flash' })
    const adapter = createLazyDirectoryStore(() => {
      if (!ready) throw new Error('会话 scope 未就绪')
      return hit
    }, 's1')

    const events = []
    adapter.subscribe(() => events.push('tick'))

    ready = true
    assert.deepEqual(adapter.getSnapshot(), { provider: 'deepseek-official', model: 'deepseek-v4-flash' })
    assert.deepEqual(events, ['tick']) // 解析时立即通知一次
    assert.equal(hit.listenerCount(), 1)
  })

  it('迁移后真实 store 变更应该 持续通知订阅者（解析后订阅不丢）', () => {
    let ready = false
    const hit = makeStore({ provider: 'deepseek-official', model: 'deepseek-v4-flash' })
    const adapter = createLazyDirectoryStore(() => {
      if (!ready) throw new Error('会话 scope 未就绪')
      return hit
    }, 's1')

    const events = []
    const unsubscribe = adapter.subscribe(() => events.push('tick'))

    ready = true
    adapter.getSnapshot() // 触发解析与迁移
    hit.setCurrent({ provider: 'zai', model: 'glm-5.3-flash' })
    assert.deepEqual(events, ['tick', 'tick'])
    assert.deepEqual(adapter.getSnapshot(), { provider: 'zai', model: 'glm-5.3-flash' })

    unsubscribe() // 迁移后的退订直达真实 store（不滞留）
    assert.equal(hit.listenerCount(), 0)
    hit.setCurrent(null)
    assert.deepEqual(events, ['tick', 'tick'])
  })

  it('解析前退订应该 从未决集合移除，迁移时不复活', () => {
    let ready = false
    const hit = makeStore(null)
    const adapter = createLazyDirectoryStore(() => {
      if (!ready) throw new Error('会话 scope 未就绪')
      return hit
    }, 's1')

    const events = []
    const unsubscribe = adapter.subscribe(() => events.push('tick'))
    unsubscribe()

    ready = true
    adapter.getSnapshot()
    assert.deepEqual(events, [])
    assert.equal(hit.listenerCount(), 0)
  })

  it('已解析时订阅应该 直接挂真实 store', () => {
    const hit = makeStore({ provider: 'p', model: 'm' })
    const adapter = createLazyDirectoryStore(() => hit, 's1')
    const events = []
    adapter.subscribe(() => events.push('tick'))
    hit.setCurrent({ provider: 'p2', model: 'm2' })
    assert.deepEqual(events, ['tick'])
    assert.deepEqual(adapter.getSnapshot(), { provider: 'p2', model: 'm2' })
  })

  it('sessionId 未定义应该 恒为 null 快照（不弃权也不误解析）', () => {
    const hit = makeStore({ provider: 'p', model: 'm' })
    const adapter = createLazyDirectoryStore(() => hit, undefined)
    assert.equal(adapter.getSnapshot(), null)
    const events = []
    adapter.subscribe(() => events.push('tick'))
    assert.deepEqual(events, [])
    assert.equal(hit.listenerCount(), 0)
  })
})
