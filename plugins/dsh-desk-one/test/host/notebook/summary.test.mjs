// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildSummary } from '../../../lib/host/notebook/summary.js'

/** Registry with a nested workspace, so longest-match behavior is exercised too. */
const registry = {
  get: (/** @type {string} */ id) => (String(id) === 'ws-1'
    ? { id: 'ws-1', path: 'C:/ws', title: '工作区' }
    : String(id) === 'ws-2' ? { id: 'ws-2', path: 'C:/ws/nested', title: '嵌套' } : undefined),
  list: () => [
    { id: 'ws-1', path: 'C:/ws', title: '工作区' },
    { id: 'ws-2', path: 'C:/ws/nested', title: '嵌套' },
  ],
}

/** One file identity record. */
const file = (/** @type {string} */ id, /** @type {string} */ rootPath, /** @type {string} */ path) =>
  ({ id, rootPath, path })

/**
 * Fake store with the list/get methods the summary reads.
 * @returns {any} fake store.
 */
function makeStore() {
  const files = new Map([
    ['f1', file('f1', 'C:/ws', 'notes/a.md')],
    ['f2', file('f2', 'C:/ws/nested', 'deep/b.md')],
  ])
  return {
    listNoteDrafts: () => [
      { id: 'd1', rootPath: 'C:/ws', path: 'notes/a.md', fileId: 'f1', drafts: [{}, {}], updatedAt: '2026-11-15T01:00:00.000Z' },
      { id: 'd0', rootPath: 'C:/ws', path: 'notes/empty.md', fileId: 'f9', drafts: [], updatedAt: '2026-11-15T03:00:00.000Z' },
      { id: 'd2', rootPath: 'C:/ws/nested', path: 'deep/b.md', fileId: 'f2', drafts: [{}], updatedAt: '2026-11-15T02:00:00.000Z' },
    ],
    listReviewRecords: () => [
      {
        id: 'r1', sessionId: 's1', fileId: 'f1', fileTitle: '笔记 A', pathSnapshot: 'notes/a.md',
        annotations: [{}, {}], createdAt: '2026-11-14T10:00:00.000Z',
      },
      {
        id: 'r2', sessionId: 's2', workspaceId: 'ws-2', fileId: 'f2', fileTitle: '笔记 B', pathSnapshot: 'deep/b.md',
        annotations: [{}], createdAt: '2026-11-15T00:00:00.000Z',
      },
    ],
    listReviewSessions: () => [
      { sessionId: 's1', workspaceId: 'ws-1', fileId: 'f1', updatedAt: '2026-11-15T02:00:00.000Z' },
      { sessionId: 's2', workspaceId: 'ws-2', fileId: 'f2', updatedAt: '2026-11-15T03:00:00.000Z' },
      { sessionId: 's3', updatedAt: '2026-11-15T04:00:00.000Z' },
    ],
    getNoteFile: (/** @type {string} */ id) => files.get(id),
  }
}

describe('批注落地页：聚合列表', () => {
  it('草稿：过滤空草稿、按更新时间倒序、带工作区名', () => {
    const summary = buildSummary(makeStore(), registry)
    assert.deepEqual(summary.drafts.map(row => row.key), ['d2', 'd1'])
    assert.deepEqual(summary.drafts.map(row => row.count), [1, 2])
    assert.equal(summary.drafts[0]?.workspaceTitle, '嵌套')
    assert.equal(summary.drafts[0]?.title, 'b')
    assert.equal(summary.drafts[1]?.workspaceTitle, '工作区')
  })

  it('记录：保留提交时的标题与工作区；缺 workspaceId 时按文件根反查', () => {
    const summary = buildSummary(makeStore(), registry)
    assert.deepEqual(summary.records.map(row => row.key), ['r2', 'r1'])
    assert.equal(summary.records[0]?.workspaceTitle, '嵌套')
    assert.equal(summary.records[1]?.workspaceTitle, '工作区')
    assert.equal(summary.records[1]?.title, '笔记 A')
    assert.equal(summary.records[1]?.count, 2)
  })

  it('最近批注：按标记时间倒序、跳过没有文件身份的标记', () => {
    const summary = buildSummary(makeStore(), registry)
    assert.deepEqual(summary.recent.map(row => row.key), ['s2', 's1'])
    assert.equal(summary.recent[0]?.path, 'deep/b.md')
    assert.equal(summary.recent[0]?.workspaceTitle, '嵌套')
  })
})
