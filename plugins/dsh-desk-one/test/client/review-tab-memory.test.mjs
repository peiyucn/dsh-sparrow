// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  readReviewTabParams, recoverReviewParams, writeReviewTabParams,
} from '../../lib/client/notebook/review-tab-memory.js'

/** Minimal notebook API fake for the recovery path. */
const fakeNotebook = (/** @type {{ markers: unknown, history: unknown, failList?: boolean }} */ input) => ({
  listReviewSessions: async () => {
    if (input.failList === true) throw new Error('offline')
    return input.markers
  },
  history: async () => input.history,
})

describe('审阅 tab 参数恢复', () => {
  it('用 review-session 标记 + 批注记录解析出笔记参数', async () => {
    const notebook = fakeNotebook({
      markers: { sessionIds: ['s1'], sessions: [{ sessionId: 's1', fileId: 'f1', workspaceId: 'w1', updatedAt: 't' }] },
      history: {
        bytes: 0,
        entries: [
          { record: { fileId: 'f1' }, status: 'linked', resolvedPath: 'Diary/a.md' },
          { record: { fileId: 'f2' }, status: 'linked', resolvedPath: 'other.md' },
        ],
      },
    })
    assert.deepEqual(await recoverReviewParams(/** @type {any} */ (notebook), 's1'), {
      path: 'Diary/a.md', fileId: 'f1', workspaceId: 'w1',
    })
  })

  it('没有标记 / 无法解析路径 / 宿主失败时返回 undefined', async () => {
    const none = fakeNotebook({ markers: { sessionIds: [] }, history: { entries: [], bytes: 0 } })
    assert.equal(await recoverReviewParams(/** @type {any} */ (none), 's1'), undefined)

    const detached = fakeNotebook({
      markers: { sessionIds: ['s2'], sessions: [{ sessionId: 's2', fileId: 'f2', workspaceId: 'w1', updatedAt: 't' }] },
      history: { bytes: 0, entries: [{ record: { fileId: 'f2' }, status: 'detached' }] },
    })
    assert.equal(await recoverReviewParams(/** @type {any} */ (detached), 's2'), undefined)

    const offline = fakeNotebook({ markers: { sessionIds: [] }, history: { entries: [], bytes: 0 }, failList: true })
    assert.equal(await recoverReviewParams(/** @type {any} */ (offline), 's1'), undefined)
  })

  it('浏览器存储可用时记住并校验参数', () => {
    const scope = /** @type {any} */ (globalThis)
    const store = new Map()
    scope.localStorage = {
      getItem: (/** @type {string} */ key) => store.has(key) ? store.get(key) : null,
      setItem: (/** @type {string} */ key, /** @type {string} */ value) => { store.set(key, value) },
      removeItem: (/** @type {string} */ key) => { store.delete(key) },
    }
    try {
      writeReviewTabParams('s1', { path: 'Diary/a.md', fileId: 'f1', workspaceId: 'w1' })
      assert.deepEqual(readReviewTabParams('s1'), { path: 'Diary/a.md', fileId: 'f1', workspaceId: 'w1' })
      store.set('dsh-desk-one.review-tab.bad', '{not json')
      assert.equal(readReviewTabParams('bad'), undefined)
    } finally {
      delete scope.localStorage
    }
  })
})
