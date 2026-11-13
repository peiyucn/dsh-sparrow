// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  hydrateReviewSessions, isReviewSession, persistReviewSession, subscribeReviewSessions,
} from '../../lib/client/reviewSessions.js'

describe('审阅会话标记', () => {
  it('启动时从宿主补齐，标记同时写宿主，失败也保留内存状态', async () => {
    let notified = 0
    const unsubscribe = subscribeReviewSessions(() => { notified += 1 })
    const marks = []
    /** @type {any} */
    const notebook = {
      listReviewSessions: async () => ({ sessionIds: ['old-session'] }),
      markReviewSession: async (/** @type {{ sessionId: string }} */ input) => { marks.push(input.sessionId) },
    }

    hydrateReviewSessions(notebook)
    assert.equal(isReviewSession('old-session'), false, 'hydrate 是异步的，调用当刻还没到')
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(isReviewSession('old-session'), true)
    assert.ok(notified >= 1)

    persistReviewSession(notebook, { sessionId: 'new-session' })
    assert.equal(isReviewSession('new-session'), true)
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.deepEqual(marks, ['new-session'])

    // A failed host write must not lose the local hint.
    /** @type {any} */
    const failing = {
      listReviewSessions: async () => ({ sessionIds: [] }),
      markReviewSession: async () => { throw new Error('offline') },
    }
    persistReviewSession(failing, { sessionId: 'offline-session' })
    assert.equal(isReviewSession('offline-session'), true)
    await new Promise(resolve => setTimeout(resolve, 0))
    unsubscribe()
  })
})
