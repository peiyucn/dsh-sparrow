
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  hydrateReviewSessions, isReviewSession, reviewSessionsReady,
} from '../../lib/client/notebook/review/sessions.js'


function fakeNotebook() {
  const state = { calls: 0, fail: true, sessionIds: ['retry-session'] }

  const api = {
    listReviewSessions: async () => {
      state.calls += 1
      if (state.fail) throw new Error('offline')
      return {
        sessionIds: state.sessionIds,
        sessions: state.sessionIds.map(sessionId => ({
          sessionId,
          fileId: `file-${sessionId}`,
          updatedAt: '2026-11-14T00:00:00.000Z',
        })),
      }
    },
    markReviewSession: async () => undefined,
  }
  return { state, api }
}

describe('审阅会话 hydrate 失败可重试（D-09）', () => {
  it('失败不锁定 hydrated：下一次调用重试，成功后一页只请求一次', async () => {
    const fake = fakeNotebook()


    hydrateReviewSessions(fake.api)
    hydrateReviewSessions(fake.api)
    await reviewSessionsReady()
    assert.equal(fake.state.calls, 1, '在途请求应被合并')
    assert.equal(isReviewSession('retry-session'), false)


    fake.state.fail = false
    hydrateReviewSessions(fake.api)
    hydrateReviewSessions(fake.api)
    await reviewSessionsReady()
    assert.equal(fake.state.calls, 2, '失败后下一次调用必须重试')
    assert.equal(isReviewSession('retry-session'), true)


    hydrateReviewSessions(fake.api)
    await reviewSessionsReady()
    assert.equal(fake.state.calls, 2, '成功后 hydrate 仍是一次性')
  })
})
