// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { groupLanes, manualBlocks, sortContainer } from '../../lib/client/tasks/types.js'

/** Minimal complete task record for lane-order tests. */
const task = (id, order, over = {}) => ({
  id,
  kind: /** @type {const} */ ('task'),
  schema: 1,
  title: id,
  body: '',
  tags: [],
  status: /** @type {const} */ ('todo'),
  color: /** @type {const} */ ('yellow'),
  order,
  archived: false,
  sessionIds: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  revision: 1,
  ...over,
})

/** Minimal complete group record for lane-order tests. */
const group = (id, order, over = {}) => ({
  id,
  kind: /** @type {const} */ ('group'),
  schema: 1,
  name: id,
  status: /** @type {const} */ ('todo'),
  order,
  archived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  revision: 1,
  ...over,
})

const names = (blocks) => blocks.map(block => block.kind === 'group' ? `group:${block.group.id}` : `task:${block.task.id}`)

describe('任务板统一块序列', () => {
  it('旧数据两套 order 重叠时按「卡片在前、分组在后」兜底', () => {
    const tasks = [task('a', 0), task('b', 1), task('c', 0, { groupId: 'g1' })]
    const groups = [group('g1', 0)]
    assert.deepEqual(names(manualBlocks(tasks, groups, 'todo')), ['task:a', 'task:b', 'group:g1'])
  })

  it('order 唯一后按块序号合并，卡片和分组可以穿插', () => {
    const tasks = [task('a', 0), task('b', 2), task('c', 1, { groupId: 'g1' })]
    const groups = [group('g1', 1)]
    assert.deepEqual(names(manualBlocks(tasks, groups, 'todo')), ['task:a', 'group:g1', 'task:b'])
    // The rendered lane must use the same merged sequence.
    assert.deepEqual(names(groupLanes(tasks, groups, 'manual').todo.blocks), ['task:a', 'group:g1', 'task:b'])
  })

  it('非手动排序视图保持「卡片在前、分组在后」，且不改写 order', () => {
    const tasks = [
      task('a', 0, { createdAt: '2026-01-03T00:00:00.000Z' }),
      task('b', 1, { createdAt: '2026-01-01T00:00:00.000Z' }),
      task('c', 0, { groupId: 'g1' }),
    ]
    const groups = [group('g1', 0)]
    const lane = groupLanes(tasks, groups, 'created').todo
    assert.deepEqual(names(lane.blocks), ['task:b', 'task:a', 'group:g1'])
    assert.deepEqual(lane.ungrouped.map(item => item.id), ['b', 'a'])
  })

  it('分组内卡片按容器排序，分组块按组顺序', () => {
    const tasks = [task('c2', 1, { groupId: 'g1' }), task('c1', 0, { groupId: 'g1' }), task('u', 5)]
    const groups = [group('g1', 4)]
    const lane = groupLanes(tasks, groups, 'manual').todo
    assert.deepEqual(lane.blocks.map(block => block.kind === 'group' ? block.tasks.map(item => item.id) : block.task.id), [['c1', 'c2'], 'u'])
  })

  it('sortContainer 的 created / due 视图是只读排序', () => {
    const tasks = [
      task('late', 0, { due: { date: '2026-12-01' }, createdAt: '2026-01-01T00:00:00.000Z' }),
      task('early', 1, { due: { date: '2026-11-01' }, createdAt: '2026-01-02T00:00:00.000Z' }),
    ]
    assert.deepEqual(sortContainer(tasks, 'created').map(item => item.id), ['late', 'early'])
    assert.deepEqual(sortContainer(tasks, 'due').map(item => item.id), ['early', 'late'])
    assert.deepEqual(sortContainer(tasks, 'manual').map(item => item.id), ['late', 'early'])
    assert.deepEqual(tasks.map(item => item.order), [0, 1], '视图排序不写回 order')
  })
})
