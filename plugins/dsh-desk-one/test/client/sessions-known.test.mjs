// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { excludeKnownSessions, knownSessionIds } from '../../lib/client/sessions/known.js'

/**
 * One archived-tree node.
 * @param {string} sessionId - node id.
 * @param {readonly any[]} [children] - nested nodes.
 * @returns {any} node-like object (only the fields the helper reads matter).
 */
function node(sessionId, children = []) {
  return { sessionId, title: sessionId, children }
}

/**
 * One trash entry.
 * @param {string} sessionId - parent id.
 * @param {readonly string[]} [subagents] - child ids.
 * @param {boolean} [legacy] - entry without a sidecar.
 * @returns {any} trash-like object.
 */
function trash(sessionId, subagents = [], legacy = false) {
  return {
    trashId: `trash-${sessionId}`,
    sessionId,
    title: sessionId,
    archivedAt: '2026-11-15T00:00:00.000Z',
    legacy,
    ...legacy ? {} : { subagents: subagents.map(id => ({ sessionId: id, title: id })) },
  }
}

describe('会话归档管理：已知 id 集合', () => {
  it('归档树递归收集根与子会话', () => {
    const known = knownSessionIds([node('a', [node('a1'), node('a2', [node('a2x')])]), node('b')], [])
    assert.deepEqual([...known.archived].sort(), ['a', 'a1', 'a2', 'a2x', 'b'])
    assert.equal(known.trashed.size, 0)
  })

  it('回收站收集条目与子会话；legacy 条目只有自身', () => {
    const known = knownSessionIds([], [trash('t1', ['t1a']), trash('t2', [], true)])
    assert.deepEqual([...known.trashed].sort(), ['t1', 't1a', 't2'])
  })

  it('活跃目录过滤掉归档 / 回收站里的会话', () => {
    const sessions = [{ id: 'a' }, { id: 'a1' }, { id: 't1' }, { id: 'free' }]
    const known = knownSessionIds([node('a', [node('a1')])], [trash('t1', ['t1a'])])
    assert.deepEqual(excludeKnownSessions(sessions, known).map(session => session.id), ['free'])
  })

  it('还没有归档数据时原样返回，避免首帧闪空', () => {
    const sessions = [{ id: 'a' }]
    assert.equal(excludeKnownSessions(sessions, { archived: new Set(), trashed: new Set() }), sessions)
  })
})
