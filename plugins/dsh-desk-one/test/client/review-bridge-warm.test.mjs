// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { warmSessionTurns } from '../../lib/client/notebook/review-bridge.js'

describe('审阅候选会话轮数预热（D-11）', () => {
  it('并发不超过默认上限且每个候选都会预热', async () => {
    let active = 0
    let maxActive = 0
    /** @type {string[]} */
    const warmed = []
    /** @type {(sessionId: string) => Promise<void>} */
    const refresh = async (sessionId) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise(resolve => setTimeout(resolve, 5))
      active -= 1
      warmed.push(sessionId)
    }

    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']
    await warmSessionTurns(ids, refresh, { timeoutMs: 50 })
    assert.equal(maxActive, 4, '默认同时在途的 projection 读取上限是 4')
    assert.deepEqual(warmed.slice().sort(), ids, '每个候选仍被预热，复用选择依据不变')
  })

  it('单个候选失败不阻塞其余候选', async () => {
    /** @type {string[]} */
    const warmed = []
    await warmSessionTurns(['ok-1', 'bad', 'ok-2'], async (sessionId) => {
      if (sessionId === 'bad') throw new Error('offline')
      warmed.push(sessionId)
    }, { concurrency: 2, timeoutMs: 50 })
    assert.deepEqual(warmed.slice().sort(), ['ok-1', 'ok-2'])
  })

  it('慢候选按单会话超时放弃，不拖住整体', async () => {
    const started = Date.now()
    await warmSessionTurns(['slow', 'fast'], async (sessionId) => {
      if (sessionId === 'slow') await new Promise(resolve => setTimeout(resolve, 200))
    }, { concurrency: 2, timeoutMs: 10 })
    assert.ok(Date.now() - started < 500, '预热总时长应受单会话超时约束')
  })
})
