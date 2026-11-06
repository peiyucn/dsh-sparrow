// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DeskModelError, createTaskRecord, filterTasks, normalizeTaskInput, patchTaskRecord, sortTasks,
} from '../../lib/model.js'

/** Build a valid task record for patch/sort tests. */
const task = (over = {}) => ({
  id: 'task_1',
  kind: 'task',
  schema: 1,
  title: '任务',
  body: '',
  tags: [],
  status: 'todo',
  color: 'default',
  order: 0,
  archived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  revision: 1,
  ...over,
})

describe('task 模型：创建 / 补丁 / 排序', () => {
  it('创建 应该 生成完整对象（todo / 未存档 / revision 1）', () => {
    const input = normalizeTaskInput({ title: '  写 spec  ', dueDate: '2026-11-30', status: 'doing' })
    assert.equal(input.title, '写 spec')
    assert.equal(input.status, 'doing')
    assert.deepEqual(input.due, { date: '2026-11-30' })
    const record = createTaskRecord(input, { id: 'task_x', now: '2026-01-01T00:00:00.000Z' })
    assert.equal(record.kind, 'task')
    assert.equal(record.revision, 1)
    assert.equal(record.archived, false)
    assert.equal(record.order, 0)
    assert.deepEqual(record.due, { date: '2026-11-30' })
  })

  it('标题必填；非法状态 / 颜色 / 日期 应该 拒绝', () => {
    assert.throws(() => normalizeTaskInput({ title: '   ' }), (error) => error instanceof DeskModelError && error.code === 'INVALID_TASK')
    assert.throws(() => normalizeTaskInput({ title: 'x', status: 'blocked' }), (error) => error instanceof DeskModelError)
    assert.throws(() => normalizeTaskInput({ title: 'x', color: 'black' }), (error) => error instanceof DeskModelError)
    assert.throws(() => normalizeTaskInput({ title: 'x', dueDate: '2026-02-31' }), (error) => error instanceof DeskModelError)
    assert.throws(() => normalizeTaskInput({ title: 'x', dueDate: '2026/11/30' }), (error) => error instanceof DeskModelError)
  })

  it('补丁 应该 改状态 / 顺序 / 截止 / 存档 并递增 revision', () => {
    const next = patchTaskRecord(task(), {
      status: 'doing', order: 3, due: { date: '2026-12-01', timezone: 'Asia/Shanghai' }, archived: true,
    }, { expectedRevision: 1, now: '2026-01-02T00:00:00.000Z' })
    assert.equal(next.status, 'doing')
    assert.equal(next.order, 3)
    assert.deepEqual(next.due, { date: '2026-12-01', timezone: 'Asia/Shanghai' })
    assert.equal(next.archived, true)
    assert.equal(next.revision, 2)
    assert.equal(next.updatedAt, '2026-01-02T00:00:00.000Z')
  })

  it('due: null 应该 清除截止日期；revision 不匹配 应该 冲突', () => {
    const cleared = patchTaskRecord(task({ due: { date: '2026-12-01' } }), { due: null }, {
      expectedRevision: 1, now: 'now',
    })
    assert.equal(cleared.due, undefined)
    assert.throws(
      () => patchTaskRecord(task(), { title: 'x' }, { expectedRevision: 2, now: 'now' }),
      (error) => error instanceof DeskModelError && error.code === 'REVISION_CONFLICT',
    )
  })

  it('分组 应该 支持创建 / 重命名补丁 / 移出（null）', () => {
    const grouped = normalizeTaskInput({ title: 'x', group: '  需求池  ' })
    assert.equal(grouped.group, '需求池')
    const record = createTaskRecord(grouped, { id: 'task_x', now: 'now' })
    assert.equal(record.group, '需求池')
    const renamed = patchTaskRecord(record, { group: '本季度' }, { expectedRevision: 1, now: 'later' })
    assert.equal(renamed.group, '本季度')
    const cleared = patchTaskRecord(record, { group: null }, { expectedRevision: 1, now: 'later' })
    assert.equal(cleared.group, undefined)
    const blank = patchTaskRecord(record, { group: '   ' }, { expectedRevision: 1, now: 'later' })
    assert.equal(blank.group, undefined)
    assert.throws(() => normalizeTaskInput({ title: 'x', group: 'g'.repeat(81) }), (error) => error instanceof DeskModelError)
  })

  it('排序 应该 按 order → createdAt → id；过滤 标题 + 正文', () => {
    const sorted = sortTasks([
      task({ id: 'b', order: 2, createdAt: '2026-01-02T00:00:00.000Z' }),
      task({ id: 'a', order: 1, createdAt: '2026-01-03T00:00:00.000Z' }),
      task({ id: 'c', order: 1, createdAt: '2026-01-01T00:00:00.000Z' }),
    ])
    assert.deepEqual(sorted.map(item => item.id), ['c', 'a', 'b'])
    assert.equal(filterTasks(sorted, '任务').length, 3)
    assert.equal(filterTasks(sorted, '不存在').length, 0)
  })
})
