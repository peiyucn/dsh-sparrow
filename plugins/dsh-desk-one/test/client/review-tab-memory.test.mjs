// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  pruneReviewTabParams, readReviewTabParams, recoverReviewParams, removeReviewTabParams, writeReviewTabParams,
} from '../../lib/client/notebook/review/tab-memory.js'

/** Storage key prefix shared with the implementation. */
const MEMO_PREFIX = 'dsh-desk-one.review-tab.'

/** Minimal notebook API fake for the recovery path. */
const fakeNotebook = (/** @type {{ markers: unknown, history: unknown, failList?: boolean }} */ input) => ({
  listReviewSessions: async () => {
    if (input.failList === true) throw new Error('offline')
    return input.markers
  },
  history: async () => input.history,
})

/**
 * Install an in-memory localStorage with the key iteration the memo cap relies on.
 * @returns {{ store: Map<string, string>, restore: () => void }}
 */
function installStorage() {
  const scope = /** @type {any} */ (globalThis)
  /** @type {Map<string, string>} */
  const store = new Map()
  scope.localStorage = {
    get length() { return store.size },
    key: (/** @type {number} */ index) => [...store.keys()][index] ?? null,
    getItem: (/** @type {string} */ key) => store.get(key) ?? null,
    setItem: (/** @type {string} */ key, /** @type {string} */ value) => { store.set(key, value) },
    removeItem: (/** @type {string} */ key) => { store.delete(key) },
  }
  return {
    store,
    restore: () => { delete scope.localStorage },
  }
}

/**
 * @param {Map<string, string>} store
 * @returns {string[]}
 */
function memoKeys(store) {
  return [...store.keys()].filter(key => key.startsWith(MEMO_PREFIX))
}

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
    const { restore } = installStorage()
    try {
      writeReviewTabParams('s1', { path: 'Diary/a.md', fileId: 'f1', workspaceId: 'w1' })
      assert.deepEqual(readReviewTabParams('s1'), { path: 'Diary/a.md', fileId: 'f1', workspaceId: 'w1' })
      const scope = /** @type {any} */ (globalThis)
      scope.localStorage.setItem(`${MEMO_PREFIX}bad`, '{not json')
      assert.equal(readReviewTabParams('bad'), undefined)
    } finally {
      restore()
    }
  })

  it('删除入口：删单条 / 按存活会话集合清理陈旧备忘', () => {
    const { restore } = installStorage()
    try {
      writeReviewTabParams('s1', { path: 'a.md', fileId: 'f1', workspaceId: 'w1' })
      writeReviewTabParams('s2', { path: 'b.md', fileId: 'f2', workspaceId: 'w1' })
      writeReviewTabParams('s3', { path: 'c.md', fileId: 'f3', workspaceId: 'w1' })

      removeReviewTabParams('s2')
      assert.equal(readReviewTabParams('s2'), undefined, '单条删除入口生效')
      assert.notEqual(readReviewTabParams('s1'), undefined)

      pruneReviewTabParams(sessionId => sessionId === 's1')
      assert.notEqual(readReviewTabParams('s1'), undefined, '存活会话的备忘保留')
      assert.equal(readReviewTabParams('s3'), undefined, '宿主已不存在的会话被清理')
    } finally {
      restore()
    }
  })

  it('有界上限：超过 100 条时按插入序淘汰最旧，最近写入的保留', () => {
    const { store, restore } = installStorage()
    try {
      for (let index = 0; index < 105; index += 1) {
        writeReviewTabParams(`s${index}`, { path: `p/${index}.md`, fileId: `f${index}`, workspaceId: 'w1' })
      }
      assert.equal(memoKeys(store).length, 100, '备忘条数有界')
      assert.equal(readReviewTabParams('s0'), undefined, '最旧的 5 条被淘汰')
      assert.equal(readReviewTabParams('s4'), undefined)
      assert.deepEqual(readReviewTabParams('s5'), { path: 'p/5.md', fileId: 'f5', workspaceId: 'w1' })
      assert.deepEqual(readReviewTabParams('s104'), { path: 'p/104.md', fileId: 'f104', workspaceId: 'w1' })
    } finally {
      restore()
    }
  })

  it('浏览器存储不可用时读写清理都不抛错', () => {
    const { restore } = installStorage()
    restore()
    assert.doesNotThrow(() => {
      assert.equal(readReviewTabParams('none'), undefined)
      writeReviewTabParams('none', { path: 'a.md', fileId: 'f', workspaceId: 'w' })
      removeReviewTabParams('none')
      pruneReviewTabParams(() => false)
    })
  })
})
