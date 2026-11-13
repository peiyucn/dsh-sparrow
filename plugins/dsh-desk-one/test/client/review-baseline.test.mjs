// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readReviewBaseline, writeReviewBaseline } from '../../lib/client/notebook/baseline.js'

/**
 * In-memory Storage stand-in.
 * @param {Record<string, string>} [initial]
 * @returns {any} fake storage with a peek helper.
 */
function fakeStorage(initial) {
  const values = new Map(Object.entries(initial ?? {}))
  return {
    getItem: (/** @type {string} */ key) => values.get(key) ?? null,
    setItem: (/** @type {string} */ key, /** @type {string} */ value) => { values.set(key, value) },
    removeItem: (/** @type {string} */ key) => { values.delete(key) },
    get: (/** @type {string} */ key) => values.get(key),
  }
}

describe('审阅轮次基线持久化', () => {
  it('写入后可按 fileId 读回', () => {
    const store = fakeStorage()
    writeReviewBaseline('file_1', { body: 'hello', at: '2026-11-13T00:00:00.000Z' }, store)
    assert.deepEqual(readReviewBaseline('file_1', store), { body: 'hello', at: '2026-11-13T00:00:00.000Z' })
    assert.equal(readReviewBaseline('file_2', store), undefined)
  })

  it('损坏 / 缺字段 / 无存储时返回 undefined', () => {
    assert.equal(readReviewBaseline('x', fakeStorage({ 'dsh-desk-one.review-baseline.x': '{' })), undefined)
    assert.equal(readReviewBaseline('x', fakeStorage({ 'dsh-desk-one.review-baseline.x': '{"body":"a"}' })), undefined)
    assert.equal(readReviewBaseline('x', undefined), undefined)
  })

  it('超大正文不写入并清掉旧值，避免撑满 storage', () => {
    const store = fakeStorage()
    writeReviewBaseline('big', { body: 'x'.repeat(200_001), at: '2026-11-13T00:00:00.000Z' }, store)
    assert.equal(readReviewBaseline('big', store), undefined)
  })
})
