import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ReviewRepository } from '../../../lib/host/store/review.js'

describe('审阅会话标记清除', () => {
  it('删除存在的 review-session 标记', async () => {
    const deleted: string[] = []
    const core = {
      nodes: {
        get: (id: string) => id === 'review_session_session-1' ? { kind: 'review-session', id } : undefined,
        delete: async (id: string) => { deleted.push(id) },
      },
    }
    const repo = new ReviewRepository(core as never)
    assert.equal(await repo.unmarkReviewSession('session-1'), true)
    assert.deepEqual(deleted, ['review_session_session-1'])
  })

  it('没有标记时返回 false 且不删除其它节点', async () => {
    const deleted: string[] = []
    const core = {
      nodes: {
        get: () => undefined,
        delete: async (id: string) => { deleted.push(id) },
      },
    }
    const repo = new ReviewRepository(core as never)
    assert.equal(await repo.unmarkReviewSession('missing'), false)
    assert.deepEqual(deleted, [])
  })
})
