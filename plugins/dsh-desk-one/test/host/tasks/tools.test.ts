

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { registerTaskTools } from '../../../lib/host/tasks/tools.js'
import { collectTools } from '../../structure/helpers.ts'

type Tool = {
  name: string
  execute: (input: Record<string, unknown>, context: unknown) => Promise<unknown>
}


function fakeStore() {
  const created: Array<Record<string, unknown>> = []
  return {
    created,
    createTask: async (raw: Record<string, unknown>) => {
      created.push(raw)
      return { id: `task_${created.length}`, title: raw.title }
    },
    listTasks: () => [],
    updateTask: async () => ({}),
  }
}

function addTool(store: unknown) {
  const tools = collectTools(registerTaskTools, store) as unknown as Tool[]
  const tool = tools.find(candidate => candidate.name === 'desk_task_add')
  if (tool === undefined) throw new Error('desk_task_add 未注册')
  return tool
}

describe('desk_task_add 会话关联', () => {
  it('link_current_session 应把工具上下文里的 agent 会话写进 sessionIds', async () => {
    const store = fakeStore()
    const tool = addTool(store)
    const output = await tool.execute(
      { title: '写周报', status: 'todo', link_current_session: true },
      { agent: { id: 'session-1' } },
    )
    assert.equal(store.created.length, 1)
    assert.deepEqual(store.created[0].sessionIds, ['session-1'])
    assert.match(String(output), /已关联本会话/u)
  })

  it('不传 link_current_session 时保持未关联', async () => {
    const store = fakeStore()
    const tool = addTool(store)
    const output = await tool.execute({ title: '普通任务' }, { agent: { id: 'session-1' } })
    assert.equal(store.created[0].sessionIds, undefined)
    assert.doesNotMatch(String(output), /已关联本会话/u)
  })

  it('缺少 agent 上下文时拒绝假装关联', async () => {
    const store = fakeStore()
    const tool = addTool(store)
    await assert.rejects(
      () => tool.execute({ title: '写周报', link_current_session: true }, {}),
      /没有会话上下文/u,
    )
    assert.equal(store.created.length, 0)
  })

  it('模型侧 due_date / due_timezone 应映射到 store 的 dueDate / dueTimezone', async () => {
    const store = fakeStore()
    const tool = addTool(store)
    await tool.execute(
      { title: '带截止的任务', due_date: '2026-11-20', due_timezone: 'Asia/Shanghai' },
      { agent: { id: 'session-1' } },
    )
    assert.equal(store.created[0].dueDate, '2026-11-20')
    assert.equal(store.created[0].dueTimezone, 'Asia/Shanghai')
    assert.equal(store.created[0].due_date, undefined)
  })
})
