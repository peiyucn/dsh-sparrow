

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MAX_TASK_SESSIONS } from '../../../lib/constants.js'
import { registerTaskTools } from '../../../lib/host/tasks/tools.js'
import { collectTools } from '../../structure/helpers.ts'

type Tool = {
  name: string
  execute: (input: Record<string, unknown>, context: unknown) => Promise<unknown>
}

type FakeTask = {
  id: string
  title: string
  revision: number
  sessionIds: string[]
  status?: string
  archived?: boolean
  groupId?: string
}

type FakeUpdate = {
  id: string
  expectedRevision: number
  patch: Record<string, unknown>
}


function fakeStore(tasks: FakeTask[] = []) {
  const created: Array<Record<string, unknown>> = []
  const updates: FakeUpdate[] = []
  return {
    created,
    updates,
    tasks,
    createTask: async (raw: Record<string, unknown>) => {
      created.push(raw)
      return { id: `task_${created.length}`, title: raw.title }
    },
    listTasks: () => tasks,
    updateTask: async (id: string, expectedRevision: number, patch: Record<string, unknown>) => {
      updates.push({ id, expectedRevision, patch })
      const current = tasks.find(task => task.id === id)
      return { ...current, ...patch, revision: (current?.revision ?? 0) + 1 }
    },
    deleteTask: async (id: string) => {
      const index = tasks.findIndex(task => task.id === id)
      if (index < 0) return false
      tasks.splice(index, 1)
      return true
    },
  }
}

function addTool(store: unknown) {
  const tools = collectTools(registerTaskTools, store) as unknown as Tool[]
  const tool = tools.find(candidate => candidate.name === 'desk_task_add')
  if (tool === undefined) throw new Error('desk_task_add 未注册')
  return tool
}

function updateTool(store: unknown) {
  const tools = collectTools(registerTaskTools, store) as unknown as Tool[]
  const tool = tools.find(candidate => candidate.name === 'desk_task_update')
  if (tool === undefined) throw new Error('desk_task_update 未注册')
  return tool
}

function listTool(store: unknown) {
  const tools = collectTools(registerTaskTools, store) as unknown as Tool[]
  const tool = tools.find(candidate => candidate.name === 'desk_task_list')
  if (tool === undefined) throw new Error('desk_task_list 未注册')
  return tool
}

function deleteTool(store: unknown) {
  const tools = collectTools(registerTaskTools, store) as unknown as Tool[]
  const tool = tools.find(candidate => candidate.name === 'desk_task_delete')
  if (tool === undefined) throw new Error('desk_task_delete 未注册')
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

describe('desk_task_update 已有任务补挂会话', () => {
  it('link_current_session 应把当前会话追加到已有 sessionIds', async () => {
    const store = fakeStore([{ id: 'task_1', title: '已有任务', revision: 3, sessionIds: ['session-a'] }])
    const tool = updateTool(store)
    const output = await tool.execute(
      { id: 'task_1', expected_revision: 3, link_current_session: true },
      { agent: { id: 'session-b' } },
    )
    assert.equal(store.updates.length, 1)
    assert.equal(store.updates[0].expectedRevision, 3)
    assert.deepEqual(store.updates[0].patch.sessionIds, ['session-a', 'session-b'])
    assert.match(String(output), /已关联本会话/u)
  })

  it('重复补挂同一会话不产生重复 id', async () => {
    const store = fakeStore([{ id: 'task_1', title: '已有任务', revision: 2, sessionIds: ['session-a'] }])
    const tool = updateTool(store)
    await tool.execute(
      { id: 'task_1', expected_revision: 2, link_current_session: true },
      { agent: { id: 'session-a' } },
    )
    assert.deepEqual(store.updates[0].patch.sessionIds, ['session-a'])
  })

  it('缺少 agent 上下文时拒绝补挂', async () => {
    const store = fakeStore([{ id: 'task_1', title: '已有任务', revision: 1, sessionIds: [] }])
    const tool = updateTool(store)
    await assert.rejects(
      () => tool.execute({ id: 'task_1', expected_revision: 1, link_current_session: true }, {}),
      /没有会话上下文/u,
    )
    assert.equal(store.updates.length, 0)
  })

  it('任务不存在时明确报错且不调用 store 更新', async () => {
    const store = fakeStore()
    const tool = updateTool(store)
    await assert.rejects(
      () => tool.execute({ id: 'task_missing', expected_revision: 1, link_current_session: true }, { agent: { id: 'session-a' } }),
      /任务不存在/u,
    )
    assert.equal(store.updates.length, 0)
  })

  it('已有会话达到上限时明确报错且不静默截断', async () => {
    const sessionIds = Array.from({ length: MAX_TASK_SESSIONS }, (_, index) => `session-${index}`)
    const store = fakeStore([{ id: 'task_1', title: '已有任务', revision: 1, sessionIds }])
    const tool = updateTool(store)
    await assert.rejects(
      () => tool.execute({ id: 'task_1', expected_revision: 1, link_current_session: true }, { agent: { id: 'session-new' } }),
      /最多关联/u,
    )
    assert.equal(store.updates.length, 0)
  })

  it('不传 link_current_session 时原有更新行为不变', async () => {
    const store = fakeStore([{ id: 'task_1', title: '旧标题', revision: 4, sessionIds: ['session-a'] }])
    const tool = updateTool(store)
    await tool.execute({ id: 'task_1', expected_revision: 4, title: '新标题' }, { agent: { id: 'session-b' } })
    assert.equal(store.updates[0].patch.title, '新标题')
    assert.equal(store.updates[0].patch.sessionIds, undefined)
  })
})

describe('desk_task_update 会话解绑', () => {
  it('unlink_session_ids 只移除指定会话', async () => {
    const store = fakeStore([{ id: 'task_1', title: '已有任务', revision: 5, sessionIds: ['session-a', 'session-b', 'session-c'] }])
    const tool = updateTool(store)
    const output = await tool.execute(
      { id: 'task_1', expected_revision: 5, unlink_session_ids: ['session-b'] },
      {},
    )
    assert.equal(store.updates.length, 1)
    assert.deepEqual(store.updates[0].patch.sessionIds, ['session-a', 'session-c'])
    assert.match(String(output), /已解绑 1 个会话/u)
  })

  it('unlink_current_session 移除当前会话', async () => {
    const store = fakeStore([{ id: 'task_1', title: '已有任务', revision: 2, sessionIds: ['session-a', 'session-b'] }])
    const tool = updateTool(store)
    const output = await tool.execute(
      { id: 'task_1', expected_revision: 2, unlink_current_session: true },
      { agent: { id: 'session-b' } },
    )
    assert.deepEqual(store.updates[0].patch.sessionIds, ['session-a'])
    assert.match(String(output), /已解绑本会话/u)
  })

  it('unlink_session_ids 与 link_current_session 可在同一次更新里替换会话', async () => {
    const store = fakeStore([{ id: 'task_1', title: '已有任务', revision: 3, sessionIds: ['session-old'] }])
    const tool = updateTool(store)
    const output = await tool.execute(
      { id: 'task_1', expected_revision: 3, unlink_session_ids: ['session-old'], link_current_session: true },
      { agent: { id: 'session-new' } },
    )
    assert.deepEqual(store.updates[0].patch.sessionIds, ['session-new'])
    assert.match(String(output), /已关联本会话/u)
    assert.match(String(output), /已解绑 1 个会话/u)
  })

  it('unlink_session_ids 含未关联 id 时整体拒绝，不静默部分删除', async () => {
    const store = fakeStore([{ id: 'task_1', title: '已有任务', revision: 1, sessionIds: ['session-a'] }])
    const tool = updateTool(store)
    await assert.rejects(
      () => tool.execute({ id: 'task_1', expected_revision: 1, unlink_session_ids: ['session-a', 'session-missing'] }, {}),
      /未关联这些会话/u,
    )
    assert.equal(store.updates.length, 0)
  })

  it('unlink_current_session 未关联时明确报错', async () => {
    const store = fakeStore([{ id: 'task_1', title: '已有任务', revision: 1, sessionIds: ['session-a'] }])
    const tool = updateTool(store)
    await assert.rejects(
      () => tool.execute({ id: 'task_1', expected_revision: 1, unlink_current_session: true }, { agent: { id: 'session-b' } }),
      /本会话未关联该任务/u,
    )
    assert.equal(store.updates.length, 0)
  })

  it('缺少 agent 上下文时拒绝解绑本会话', async () => {
    const store = fakeStore([{ id: 'task_1', title: '已有任务', revision: 1, sessionIds: ['session-a'] }])
    const tool = updateTool(store)
    await assert.rejects(
      () => tool.execute({ id: 'task_1', expected_revision: 1, unlink_current_session: true }, {}),
      /没有会话上下文/u,
    )
    assert.equal(store.updates.length, 0)
  })

  it('link_current_session 与 unlink_current_session 不能同时传', async () => {
    const store = fakeStore([{ id: 'task_1', title: '已有任务', revision: 1, sessionIds: ['session-a'] }])
    const tool = updateTool(store)
    await assert.rejects(
      () => tool.execute({ id: 'task_1', expected_revision: 1, link_current_session: true, unlink_current_session: true }, { agent: { id: 'session-b' } }),
      /不能同时关联和解绑/u,
    )
    assert.equal(store.updates.length, 0)
  })

  it('unlink_session_ids 为空时明确报错', async () => {
    const store = fakeStore([{ id: 'task_1', title: '已有任务', revision: 1, sessionIds: ['session-a'] }])
    const tool = updateTool(store)
    await assert.rejects(
      () => tool.execute({ id: 'task_1', expected_revision: 1, unlink_session_ids: [] }, {}),
      /至少需要一个会话 id/u,
    )
    assert.equal(store.updates.length, 0)
  })

  it('unlink_session_ids 不需要 agent 上下文', async () => {
    const store = fakeStore([{ id: 'task_1', title: '已有任务', revision: 4, sessionIds: ['session-a'] }])
    const tool = updateTool(store)
    await tool.execute({ id: 'task_1', expected_revision: 4, unlink_session_ids: ['session-a'] }, {})
    assert.deepEqual(store.updates[0].patch.sessionIds, [])
  })
})

describe('desk_task_list 当前会话过滤', () => {
  const tasks: FakeTask[] = [
    { id: 'task_1', title: '本会话任务', revision: 1, sessionIds: ['session-1'], status: 'todo' },
    { id: 'task_2', title: '别的会话任务', revision: 1, sessionIds: ['session-2'], status: 'todo' },
    { id: 'task_3', title: '没有会话', revision: 1, sessionIds: [], status: 'doing' },
  ]

  it('linked_to_current_session 只返回当前会话挂的任务', async () => {
    const tool = listTool(fakeStore(tasks))
    const output = JSON.parse(String(await tool.execute(
      { linked_to_current_session: true },
      { agent: { id: 'session-1' } },
    ))) as { total: number; tasks: FakeTask[] }
    assert.equal(output.total, 1)
    assert.deepEqual(output.tasks.map(task => task.id), ['task_1'])
  })

  it('linked_to_current_session 可与状态 / 关键词组合', async () => {
    const tool = listTool(fakeStore(tasks))
    const output = JSON.parse(String(await tool.execute(
      { linked_to_current_session: true, status: 'doing' },
      { agent: { id: 'session-1' } },
    ))) as { total: number }
    assert.equal(output.total, 0)
    const byQuery = JSON.parse(String(await tool.execute(
      { linked_to_current_session: true, query: '本会话' },
      { agent: { id: 'session-1' } },
    ))) as { total: number }
    assert.equal(byQuery.total, 1)
  })

  it('缺少 agent 上下文时拒绝按当前会话过滤', async () => {
    const tool = listTool(fakeStore(tasks))
    await assert.rejects(
      () => tool.execute({ linked_to_current_session: true }, {}),
      /没有会话上下文/u,
    )
  })

  it('不传 linked_to_current_session 时保持原行为', async () => {
    const tool = listTool(fakeStore(tasks))
    const output = JSON.parse(String(await tool.execute({}, { agent: { id: 'session-1' } }))) as { total: number }
    assert.equal(output.total, 3)
  })
})

describe('desk_task_delete 删除任务卡', () => {
  it('按 revision 删除任务，不碰会话', async () => {
    const store = fakeStore([{ id: 'task_1', title: '写周报', revision: 3, sessionIds: ['session-1'] }])
    const tool = deleteTool(store)
    const output = JSON.parse(String(await tool.execute({ id: 'task_1', expected_revision: 3 }, {}))) as { deleted: boolean, summary: string }
    assert.equal(output.deleted, true)
    assert.match(output.summary, /已删除任务/u)
    assert.equal(store.tasks.length, 0)
  })

  it('revision 不一致时拒绝删除', async () => {
    const store = fakeStore([{ id: 'task_1', title: '写周报', revision: 3, sessionIds: [] }])
    const tool = deleteTool(store)
    await assert.rejects(
      () => tool.execute({ id: 'task_1', expected_revision: 2 }, {}),
      /任务已被修改/u,
    )
    assert.equal(store.tasks.length, 1)
  })

  it('任务不存在时明确报错', async () => {
    const store = fakeStore()
    const tool = deleteTool(store)
    await assert.rejects(
      () => tool.execute({ id: 'task_missing', expected_revision: 1 }, {}),
      /任务不存在/u,
    )
  })
})
