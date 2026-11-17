
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { excludeKnownSessions, knownSessionIds, pruneKnownHidden } from '../../lib/client/sessions/known.js'

type TreeNode = { sessionId: string; title: string; children: TreeNode[] }


function node(sessionId: string, children: TreeNode[] = []): TreeNode {
  return { sessionId, title: sessionId, children }
}


function trash(sessionId: string, subagents: string[] = [], legacy = false) {
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

describe('会话归档管理：乐观隐藏的回收', () => {
  it('归档分区接手展示后清掉隐藏，取消归档时才能立刻回到活跃列表', () => {
    const hidden = new Set(['a'])
    const known = knownSessionIds([node('a')], [])
    assert.deepEqual([...pruneKnownHidden(hidden, known)], [], '归档分区已展示的 id 不得继续隐藏')
  })

  it('回收站分区同样算接手；未展示的 id 继续隐藏', () => {
    const hidden = new Set(['a', 'b', 'c'])
    const known = knownSessionIds([], [trash('b')])
    assert.deepEqual([...pruneKnownHidden(hidden, known)].sort(), ['a', 'c'])
  })

  it('没有分区接手的 id 时返回同一集合，不制造无意义重渲染', () => {
    const hidden = new Set(['a'])
    assert.equal(pruneKnownHidden(hidden, knownSessionIds([], [])), hidden)
  })
})
