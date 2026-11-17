// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  activityTimeOf, sortByRecentActivity, sortTreeByRecentActivity,
} from '../../../lib/host/sessions/activity-order.js'

/** Minimal session row for the ordering contract. */
function row(id, createdAt, lastActiveAt, children = []) {
  return { id, createdAt, ...lastActiveAt === undefined ? {} : { lastActiveAt }, children }
}

describe('会话管理活动时间排序', () => {
  it('活动时间优先 lastActiveAt，其次 updatedAt，最后 createdAt', () => {
    assert.equal(activityTimeOf({ createdAt: 1, lastActiveAt: 9 }), 9)
    assert.equal(activityTimeOf({ createdAt: 1, updatedAt: 5 }), 5)
    assert.equal(activityTimeOf({ createdAt: 1 }), 1)
    assert.equal(activityTimeOf({ createdAt: 1, lastActiveAt: 0, updatedAt: 5 }), 0)
  })

  it('游离会话按最近活动倒序，同时间保持输入顺序', () => {
    const items = [
      row('old', 10, 30),
      row('newest', 20, 90),
      row('tie-a', 30, 60),
      row('tie-b', 40, 60),
      row('created-only', 50),
    ]
    assert.deepEqual(
      sortByRecentActivity(items).map(item => item.id),
      ['newest', 'tie-a', 'tie-b', 'created-only', 'old'],
    )
    assert.deepEqual(items.map(item => item.id), ['old', 'newest', 'tie-a', 'tie-b', 'created-only'])
  })

  it('归档树根和子节点都按最近活动倒序，且不改原树', () => {
    const tree = [
      row('root-old', 10, 100, [row('child-old', 11, 20), row('child-new', 12, 80)]),
      row('root-new', 20, 200),
    ]
    const sorted = sortTreeByRecentActivity(tree)
    assert.deepEqual(sorted.map(node => node.id), ['root-new', 'root-old'])
    assert.deepEqual(sorted[1].children.map(node => node.id), ['child-new', 'child-old'])
    assert.deepEqual(tree[0].children.map(node => node.id), ['child-old', 'child-new'])
  })

  it('没有 lastActiveAt 的冷会话按 createdAt 参与排序', () => {
    const sorted = sortTreeByRecentActivity([
      row('older', 10),
      row('active', 5, 50),
      row('newer', 20),
    ])
    assert.deepEqual(sorted.map(node => node.id), ['active', 'newer', 'older'])
  })
})
