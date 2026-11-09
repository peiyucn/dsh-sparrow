// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { activeSessionGroups, workspaceLabel } from '../../lib/client/sessions/catalog.js'

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
    ], [{ id: 'w-a', title: 'Repo A', path: 'C:\\work\\repo-a', sessionIds: ['a', 'b'] }])
    assert.deepEqual(groups.map(group => group.label).sort(), ['Repo A', 'repo-b'])
    assert.ok(groups.some(group => group.key === 'ws:w-a'), '工作区成员优先用 registry 分组')
    assert.ok(groups.some(group => group.key === 'cwd:/work/repo-b'), '无工作区记录时回退 cwd')
    const repoA = groups.find(group => group.label === 'Repo A')
    assert.deepEqual(repoA?.sessions.map(item => item.id), ['a', 'b'], '运行中优先')
    assert.ok(!groups.some(group => group.sessions.some(item => item.id === 'd')))
  })

  it('子代理跟随父会话嵌套，不再单独成组', () => {
    const parent = session('p', { cwd: 'C:\\work\\repo-a', updatedAt: 10 })
    const child = session('c', {
      cwd: 'C:\\work\\repo-a', updatedAt: 20, subagent: true, parentId: 'p',
    })
    const groups = activeSessionGroups([child, parent], [{ id: 'w-a', title: 'Repo A', path: 'C:\\work\\repo-a', sessionIds: ['p'] }])
    assert.equal(groups.length, 1)
    assert.deepEqual(groups[0]?.rows.map(row => [row.session.id, row.depth]), [['p', 0], ['c', 1]])
    assert.deepEqual(groups[0]?.sessions.map(item => item.id).sort(), ['c', 'p'])
  })
  it('无工作区会话归入空 label 组，路径末尾分隔符被忽略', () => {
    assert.equal(workspaceLabel('C:\\work\\repo-a\\'), 'repo-a')
    assert.equal(workspaceLabel('/work/repo-b'), 'repo-b')
    assert.equal(workspaceLabel(undefined), '')
    const groups = activeSessionGroups([session('x')])
    assert.equal(groups[0]?.label, '')
  })
})
