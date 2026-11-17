
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { withLinkedSessions } from '../../lib/client/tasks/types.js'


const task = ( id,  sessionIds) => ({
  id,
  kind:  ('task'),
  schema: 1,
  title: id,
  body: '',
  tags: [],
  status:  ('todo'),
  color:  ('yellow'),
  order: 0,
  archived: false,
  sessionIds,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  revision: 1,
})

describe('任务卡会话关联的乐观更新', () => {
  it('只替换目标任务的关联列表，其它任务原样保留', () => {
    const tasks = [task('a', ['s1']), task('b', ['s2'])]
    const next = withLinkedSessions(tasks, 'a', ['s1', 's3'])
    assert.deepEqual(next[0]?.sessionIds, ['s1', 's3'])
    assert.equal(next[1], tasks[1], '未涉及的任务不应被复制')
    assert.deepEqual(tasks[0]?.sessionIds, ['s1'], '不改写旧数组')
  })

  it('连续两次点击基于上一次的乐观结果（后一次不会覆盖前一次）', () => {
    let tasks = [task('a', [])]
    tasks = withLinkedSessions(tasks, 'a', ['s1'])

    const current = tasks[0]?.sessionIds ?? []
    tasks = withLinkedSessions(tasks, 'a', [...current, 's2'])
    assert.deepEqual(tasks[0]?.sessionIds, ['s1', 's2'])
  })

  it('目标 id 不存在时返回等价列表', () => {
    const tasks = [task('a', [])]
    assert.deepEqual(withLinkedSessions(tasks, 'missing', ['s9']), tasks)
  })
})
