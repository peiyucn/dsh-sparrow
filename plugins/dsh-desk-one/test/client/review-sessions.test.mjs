// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  hydrateReviewSessions, isReviewSession, persistReviewSession, pickReusableReviewSession,
  reviewSessionCandidates, reviewSessionsReady, subscribeReviewSessions,
} from '../../lib/client/reviewSessions.js'

/** Review markers the fake host returns; hydration runs once per module, so the first test owns it. */
const HOST_MARKERS = [
  { sessionId: 'old-session', workspaceId: 'w1', fileId: 'file-a', updatedAt: '2026-11-13T10:00:00.000Z' },
  { sessionId: 'older-session', workspaceId: 'w1', fileId: 'file-a', updatedAt: '2026-11-12T10:00:00.000Z' },
  { sessionId: 'legacy-session', fileId: 'file-b', updatedAt: '2026-11-11T10:00:00.000Z' },
]

describe('审阅会话标记', () => {
  it('启动时从宿主补齐（含文件身份），标记同时写宿主，失败也保留内存状态', async () => {
    let notified = 0
    const unsubscribe = subscribeReviewSessions(() => { notified += 1 })
    const marks = []
    /** @type {any} */
    const notebook = {
      listReviewSessions: async () => ({
        sessionIds: HOST_MARKERS.map(marker => marker.sessionId),
        sessions: HOST_MARKERS,
      }),
      markReviewSession: async (/** @type {{ sessionId: string }} */ input) => { marks.push(input.sessionId) },
    }

    hydrateReviewSessions(notebook)
    assert.equal(isReviewSession('old-session'), false, 'hydrate 是异步的，调用当刻还没到')
    await reviewSessionsReady()
    assert.equal(isReviewSession('old-session'), true)
    assert.equal(isReviewSession('legacy-session'), true)
    assert.ok(notified >= 1)

    // Durable note identity drives reopen: newest first, per file.
    assert.deepEqual(reviewSessionCandidates('file-a').map(info => info.sessionId), ['old-session', 'older-session'])
    assert.deepEqual(reviewSessionCandidates('file-b').map(info => info.sessionId), ['legacy-session'])
    assert.deepEqual(reviewSessionCandidates('unknown-file'), [])

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

  it('持久化时记录文件身份，后续缺省字段不丢身份', () => {
    /** @type {any} */
    const notebook = {
      listReviewSessions: async () => ({ sessionIds: [] }),
      markReviewSession: async () => undefined,
    }
    persistReviewSession(notebook, { sessionId: 'persisted-session', workspaceId: 'w1', fileId: 'file-c' })
    assert.deepEqual(reviewSessionCandidates('file-c').map(info => info.sessionId), ['persisted-session'])
    // A later tab mount without navigation params must keep the known identity.
    persistReviewSession(notebook, { sessionId: 'persisted-session', workspaceId: 'w1' })
    assert.deepEqual(reviewSessionCandidates('file-c').map(info => info.sessionId), ['persisted-session'])
  })

  it('复用选择：同工作区最新且仍可打开的会话优先，否则回退下一个', () => {
    const candidates = [
      { sessionId: 'a', workspaceId: 'w1', fileId: 'file-x', updatedAt: '4' },
      { sessionId: 'b', workspaceId: 'w2', fileId: 'file-x', updatedAt: '3' },
      { sessionId: 'c', fileId: 'file-x', updatedAt: '2' },
    ]
    assert.equal(pickReusableReviewSession(candidates, 'w1', () => ({ openable: true })), 'a')
    assert.equal(pickReusableReviewSession(candidates, 'w2', () => ({ openable: true })), 'b')
    // A marker that predates workspace recording matches any workspace.
    assert.equal(pickReusableReviewSession(candidates, 'w1', sessionId => ({ openable: sessionId !== 'a' })), 'c')
    // Nothing openable: start a new Session instead.
    assert.equal(pickReusableReviewSession(candidates, 'w1', () => ({ openable: false })), undefined)
    assert.equal(pickReusableReviewSession([], 'w1', () => ({ openable: true })), undefined)
  })

  it('复用选择：0 轮空会话只在没有有内容会话时使用', () => {
    const candidates = [
      { sessionId: 'blank-new', workspaceId: 'w1', fileId: 'file-y', updatedAt: '9' },
      { sessionId: 'real-old', workspaceId: 'w1', fileId: 'file-y', updatedAt: '1' },
    ]
    const inspect = sessionId => ({ openable: true, turns: sessionId === 'blank-new' ? 0 : 5 })
    assert.equal(pickReusableReviewSession(candidates, 'w1', inspect), 'real-old')
    // All 0-turn: the newest blank still reopens (a genuinely new review in progress).
    assert.equal(pickReusableReviewSession(candidates, 'w1', () => ({ openable: true, turns: 0 })), 'blank-new')
    // Unknown turn counts (older host): newest wins.
    assert.equal(pickReusableReviewSession(candidates, 'w1', () => ({ openable: true })), 'blank-new')
  })
})
