// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { activeSessionGroups, archivedSessionTree, workspaceLabel } from '../../lib/client/sessions/catalog.js'

/** Minimal session chip fixture for grouping tests. */
const session = (id, over = {}) => ({
  id,
  title: id,
  running: false,
  availability: /** @type {const} */ ('available'),
  updatedAt: 0,
  subagent: false,
  ...over,
})

describe('Sessions 目录分组', () => {
  it('活跃会话按工作区分组，归档与不可用不进入活跃目录', () => {
    const groups = activeSessionGroups([
      session('a', { cwd: 'C:\\work\\repo-a', running: true, updatedAt: 3 }),
      session('b', { cwd: 'C:\\work\\repo-a', updatedAt: 1 }),
      session('c', { cwd: '/work/repo-b', updatedAt: 2 }),
      session('d', { cwd: 'C:\\work\\repo-a', availability: 'archived' }),
    ])
    assert.deepEqual(groups.map(group => group.label).sort(), ['repo-a', 'repo-b'])
    const repoA = groups.find(group => group.label === 'repo-a')
    assert.deepEqual(repoA?.sessions.map(item => item.id), ['a', 'b'], '运行中优先')
    assert.ok(!groups.some(group => group.sessions.some(item => item.id === 'd')))
  })

  it('无工作区会话归入空 label 组，路径末尾分隔符被忽略', () => {
    assert.equal(workspaceLabel('C:\\work\\repo-a\\'), 'repo-a')
    assert.equal(workspaceLabel('/work/repo-b'), 'repo-b')
    assert.equal(workspaceLabel(undefined), '')
    const groups = activeSessionGroups([session('x')])
    assert.equal(groups[0]?.label, '')
  })

  it('归档会话按父子关系排成树，父未归档的子会话提升为根', () => {
    const archived = [
      session('root', { availability: 'archived', updatedAt: 5 }),
      session('child', { availability: 'archived', parentId: 'root', updatedAt: 4 }),
      session('grand', { availability: 'archived', parentId: 'child', updatedAt: 3 }),
      session('orphan', { availability: 'archived', parentId: 'missing', updatedAt: 2 }),
    ]
    assert.deepEqual(archivedSessionTree(archived).map(node => [node.session.id, node.depth]), [
      ['root', 0],
      ['child', 1],
      ['grand', 2],
      ['orphan', 0],
    ])
  })
})
