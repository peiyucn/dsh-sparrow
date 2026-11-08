// @ts-check
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { describe, it } from 'node:test'
import { DomainError } from '@deepseek-ai/dsh-storage-domain'
import { apply, inject, name } from '../../../lib/host.js'
import { ROUTES } from '../../../lib/constants.js'

/**
 * 官方存储域的 KV 桩：只实现 DeskStore 用到的 handle（get/entries/keys/size/put/delete/update）。
 * update 在缺失 key 时抛官方 `DomainError('missing-key')`，与真实域行为一致（store 据此映射 404）。
 */
const fakeDomain = () => {
  const tables = new Map()
  const tableOf = (tableName) => {
    if (!tables.has(tableName)) tables.set(tableName, new Map())
    const records = tables.get(tableName)
    return {
      get: key => records.get(key),
      entries: () => [...records.entries()][Symbol.iterator](),
      keys: () => [...records.keys()][Symbol.iterator](),
      get size() { return records.size },
      put: async (key, value) => { records.set(key, value) },
      delete: async key => records.delete(key),
      update: async (key, transform) => {
        if (!records.has(key)) throw new DomainError('missing-key', `no record '${key}'`)
        const next = transform(records.get(key))
        records.set(key, next)
        return next
      },
    }
  }
  return { name: 'desk_one', table: tableOf, close: async () => {} }
}

/** host 上下文桩：收集工具 / 路由 / effect，storageDomain.open 返回上面的 KV 桩。 */
const fakeHost = () => {
  /** @type {{ tools: any[], routes: any[], effects: any[] }} */
  const collected = { tools: [], routes: [], effects: [] }
  const domain = fakeDomain()
  const ctx = {
    logger: { warn: () => {}, info: () => {} },
    get: () => undefined,
    effect: (factory) => { collected.effects.push(factory()); return () => {} },
    storageDomain: { open: async () => domain },
    tools: { register: (definition) => { collected.tools.push(definition) } },
    webServer: {
      register: (route) => { collected.routes.push(route); return () => {} },
    },
  }
  return { ctx, collected, domain }
}

const fakeResponse = () => {
  const result = { statusCode: 0, body: '', headersSent: false }
  return {
    get headersSent() { return result.headersSent },
    get statusCode() { return result.statusCode },
    set statusCode(value) { result.statusCode = value },
    get body() { return result.body },
    setHeader: () => {},
    end: (chunk) => { result.headersSent = true; result.body = chunk },
  }
}

/** @param {{ method: string, url: string, body?: string, headers?: Record<string, string> }} spec */
const fakeRequest = ({ method, url, body, headers = {} }) => {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(body)])
  return Object.assign(stream, { method, url, headers })
}

const callRoute = async (handler, spec) => {
  const res = fakeResponse()
  await handler(fakeRequest(spec), res)
  return { status: res.statusCode, json: JSON.parse(res.body ?? '{}') }
}

describe('host 装配（apply 接线）', () => {
  it('入口 应该 导出 name / inject 硬依赖服务（含会话归档所需服务）', () => {
    assert.equal(name, 'dsh-desk-one')
    assert.deepEqual(inject, [
      'webServer', 'storageDomain', 'tools',
      'sessions', 'agents', 'workspaceRegistry', 'sessionPersistence', 'sessionQuery',
    ])
  })

  it('apply 应该 打开存储域、挂前缀路由、注册便签 + 任务工具', async () => {
    const { ctx, collected } = fakeHost()
    await apply(ctx)
    assert.equal(collected.routes.length, 1)
    assert.equal(collected.routes[0].kind, 'prefix')
    assert.equal(collected.routes[0].path, '/api/desk-one')
    assert.deepEqual(
      collected.tools.map(tool => tool.name).sort(),
      [
        'desk_group_add', 'desk_group_archive', 'desk_group_delete', 'desk_group_list', 'desk_group_move',
        'desk_group_update',
        'desk_note_add', 'desk_note_delete', 'desk_note_list', 'desk_note_update',
        'desk_task_add', 'desk_task_archive', 'desk_task_complete', 'desk_task_list', 'desk_task_update',
      ],
    )
    assert.ok(collected.effects.length >= 2, '存储域与路由都要有 effect 清理')
  })

  it('REST 全链路 应该 能建 / 查 / 改 / 删（对真实 handler + KV 桩）', async () => {
    const { ctx, collected } = fakeHost()
    await apply(ctx)
    const handler = collected.routes[0].handler
    const host = { host: '127.0.0.1:3080' }

    const created = await callRoute(handler, {
      method: 'POST',
      url: ROUTES.notes,
      body: JSON.stringify({ title: '第一条便签', body: '正文', color: 'yellow' }),
      headers: host,
    })
    assert.equal(created.status, 201)
    assert.equal(created.json.note.title, '第一条便签')
    assert.equal(created.json.note.color, 'yellow')
    assert.equal(created.json.note.revision, 1)
    const id = created.json.note.id
    assert.match(id, /^note_/u)

    const listed = await callRoute(handler, { method: 'GET', url: `${ROUTES.notes}?q=第一条`, headers: host })
    assert.equal(listed.status, 200)
    assert.equal(listed.json.notes.length, 1)

    const updated = await callRoute(handler, {
      method: 'POST',
      url: ROUTES.noteUpdate,
      body: JSON.stringify({ id, expectedRevision: 1, patch: { pinned: true, title: '改过的标题' } }),
      headers: host,
    })
    assert.equal(updated.status, 200)
    assert.equal(updated.json.note.revision, 2)
    assert.equal(updated.json.note.pinned, true)

    const stale = await callRoute(handler, {
      method: 'POST',
      url: ROUTES.noteUpdate,
      body: JSON.stringify({ id, expectedRevision: 1, patch: { title: '旧版本写入' } }),
      headers: host,
    })
    assert.equal(stale.status, 409)

    const deleted = await callRoute(handler, {
      method: 'POST',
      url: ROUTES.noteDelete,
      body: JSON.stringify({ id }),
      headers: host,
    })
    assert.equal(deleted.status, 200)
    assert.equal(deleted.json.deleted, true)

    const empty = await callRoute(handler, { method: 'GET', url: ROUTES.notes, headers: host })
    assert.equal(empty.json.notes.length, 0)
  })

  it('任务 REST 全链路 应该 能建 / 查 / 改状态 / 存档 / 删', async () => {
    const { ctx, collected } = fakeHost()
    await apply(ctx)
    const handler = collected.routes[0].handler
    const host = { host: '127.0.0.1:3080' }

    const created = await callRoute(handler, {
      method: 'POST',
      url: ROUTES.tasks,
      body: JSON.stringify({ title: '任务一', dueDate: '2026-11-30', status: 'todo', sessionIds: ['session-a', 'session-b'] }),
      headers: host,
    })
    assert.equal(created.status, 201)
    assert.equal(created.json.task.title, '任务一')
    assert.equal(created.json.task.status, 'todo')
    assert.equal(created.json.task.archived, false)
    assert.equal(created.json.task.groupId, undefined)
    assert.deepEqual(created.json.task.sessionIds, ['session-a', 'session-b'])
    assert.deepEqual(created.json.task.due, { date: '2026-11-30' })
    const id = created.json.task.id
    assert.match(id, /^task_/u)

    const listed = await callRoute(handler, { method: 'GET', url: `${ROUTES.tasks}?status=todo`, headers: host })
    assert.equal(listed.status, 200)
    assert.equal(listed.json.tasks.length, 1)

    const moved = await callRoute(handler, {
      method: 'POST',
      url: ROUTES.taskUpdate,
      body: JSON.stringify({
        id,
        expectedRevision: 1,
        patch: { status: 'doing', order: 4, sessionIds: ['session-c'] },
      }),
      headers: host,
    })
    assert.equal(moved.status, 200)
    assert.equal(moved.json.task.status, 'doing')
    assert.equal(moved.json.task.order, 4)
    assert.deepEqual(moved.json.task.sessionIds, ['session-c'])
    assert.equal(moved.json.task.revision, 2)

    const archived = await callRoute(handler, {
      method: 'POST',
      url: ROUTES.taskUpdate,
      body: JSON.stringify({ id, expectedRevision: 2, patch: { archived: true } }),
      headers: host,
    })
    assert.equal(archived.status, 200)
    assert.equal(archived.json.task.archived, true)

    const boardOnly = await callRoute(handler, { method: 'GET', url: ROUTES.tasks, headers: host })
    assert.equal(boardOnly.json.tasks.length, 0, '默认不返回存档任务')
    const withArchive = await callRoute(handler, { method: 'GET', url: `${ROUTES.tasks}?include_archived=1`, headers: host })
    assert.equal(withArchive.json.tasks.length, 1)

    const deleted = await callRoute(handler, {
      method: 'POST',
      url: ROUTES.taskDelete,
      body: JSON.stringify({ id }),
      headers: host,
    })
    assert.equal(deleted.status, 200)
    assert.equal(deleted.json.deleted, true)
  })

  it('分组 REST 全链路 应该 能建 / 查 / 改名 / 整组跨列 / 删除并解绑任务', async () => {
    const { ctx, collected } = fakeHost()
    await apply(ctx)
    const handler = collected.routes[0].handler
    const host = { host: '127.0.0.1:3080' }

    const groupCreated = await callRoute(handler, {
      method: 'POST',
      url: ROUTES.groups,
      body: JSON.stringify({ name: '需求池', status: 'todo' }),
      headers: host,
    })
    assert.equal(groupCreated.status, 201)
    assert.equal(groupCreated.json.group.name, '需求池')
    assert.equal(groupCreated.json.group.status, 'todo')
    assert.equal(groupCreated.json.group.order, 0)
    assert.equal(groupCreated.json.group.revision, 1)
    const groupId = groupCreated.json.group.id
    assert.match(groupId, /^group_/u)

    const duplicate = await callRoute(handler, {
      method: 'POST',
      url: ROUTES.groups,
      body: JSON.stringify({ name: '需求池', status: 'todo' }),
      headers: host,
    })
    assert.equal(duplicate.status, 400)

    const taskCreated = await callRoute(handler, {
      method: 'POST',
      url: ROUTES.tasks,
      body: JSON.stringify({ title: '组内任务', groupId }),
      headers: host,
    })
    assert.equal(taskCreated.status, 201)
    assert.equal(taskCreated.json.task.groupId, groupId)
    assert.equal(taskCreated.json.task.status, 'todo')
    const taskId = taskCreated.json.task.id

    const wrongLane = await callRoute(handler, {
      method: 'POST',
      url: ROUTES.tasks,
      body: JSON.stringify({ title: '错泳道任务', status: 'done', groupId }),
      headers: host,
    })
    assert.equal(wrongLane.status, 400, '任务不能挂到其它泳道的分组')

    const groupsListed = await callRoute(handler, { method: 'GET', url: ROUTES.groups, headers: host })
    assert.equal(groupsListed.status, 200)
    assert.equal(groupsListed.json.groups.length, 1)

    const renamed = await callRoute(handler, {
      method: 'POST',
      url: ROUTES.groupUpdate,
      body: JSON.stringify({ id: groupId, expectedRevision: 1, patch: { name: '需求池 v2', order: 0 } }),
      headers: host,
    })
    assert.equal(renamed.status, 200)
    assert.equal(renamed.json.group.name, '需求池 v2')
    assert.equal(renamed.json.group.revision, 2)

    const moved = await callRoute(handler, {
      method: 'POST',
      url: ROUTES.groupMove,
      body: JSON.stringify({ id: groupId, expectedRevision: 2, status: 'doing', order: 0 }),
      headers: host,
    })
    assert.equal(moved.status, 200)
    assert.equal(moved.json.group.status, 'doing')
    assert.equal(moved.json.tasks.length, 1)
    assert.equal(moved.json.tasks[0].id, taskId)
    assert.equal(moved.json.tasks[0].status, 'doing')
    assert.equal(moved.json.groups.length, 1, '移动响应带回权威分组列表')
    assert.equal(moved.json.groups[0].status, 'doing')

    const doingTasks = await callRoute(handler, { method: 'GET', url: `${ROUTES.tasks}?status=doing`, headers: host })
    assert.equal(doingTasks.json.tasks.length, 1)
    assert.equal(doingTasks.json.tasks[0].groupId, groupId)

    const movedToDone = await callRoute(handler, {
      method: 'POST',
      url: ROUTES.groupMove,
      body: JSON.stringify({ id: groupId, expectedRevision: moved.json.group.revision, status: 'done', order: 0 }),
      headers: host,
    })
    assert.equal(movedToDone.status, 200)
    assert.equal(movedToDone.json.group.status, 'done')

    const archived = await callRoute(handler, {
      method: 'POST',
      url: ROUTES.groupArchive,
      body: JSON.stringify({ id: groupId, expectedRevision: movedToDone.json.group.revision, archived: true }),
      headers: host,
    })
    assert.equal(archived.status, 200)
    assert.equal(archived.json.group.archived, true)
    assert.equal(archived.json.tasks.length, 1)
    assert.equal(archived.json.tasks[0].archived, true)

    const boardAfterArchive = await callRoute(handler, { method: 'GET', url: ROUTES.tasks, headers: host })
    assert.equal(boardAfterArchive.json.tasks.length, 0, '整组存档后卡片也离开板面')

    const restored = await callRoute(handler, {
      method: 'POST',
      url: ROUTES.groupArchive,
      body: JSON.stringify({ id: groupId, expectedRevision: archived.json.group.revision, archived: false }),
      headers: host,
    })
    assert.equal(restored.status, 200)
    assert.equal(restored.json.group.archived, false)
    assert.equal(restored.json.tasks[0].archived, false)

    const archivedAgain = await callRoute(handler, {
      method: 'POST',
      url: ROUTES.groupArchive,
      body: JSON.stringify({ id: groupId, expectedRevision: restored.json.group.revision, archived: true }),
      headers: host,
    })
    assert.equal(archivedAgain.status, 200)

    const deleted = await callRoute(handler, {
      method: 'POST',
      url: ROUTES.groupDelete,
      body: JSON.stringify({ id: groupId }),
      headers: host,
    })
    assert.equal(deleted.status, 200)

    const afterDelete = await callRoute(handler, { method: 'GET', url: `${ROUTES.tasks}?include_archived=1`, headers: host })
    assert.equal(afterDelete.json.tasks.length, 0, '删除存档分组时连卡片一起删除')
  })

  it('agent 工具 应该 与 REST 共用同一份数据（工具建 → 路由查）', async () => {
    const { ctx, collected } = fakeHost()
    await apply(ctx)
    const addTool = collected.tools.find(tool => tool.name === 'desk_note_add')
    assert.ok(addTool)
    const exec = { signal: AbortSignal.timeout(1_000) }
    const output = await addTool.execute({ body: '来自工具的一条便签' }, exec)
    assert.equal(typeof output, 'string')
    assert.equal(JSON.parse(output).ok, true)

    const listed = await callRoute(collected.routes[0].handler, {
      method: 'GET',
      url: ROUTES.notes,
      headers: { host: '127.0.0.1:3080' },
    })
    assert.equal(listed.json.notes.length, 1)
    assert.equal(listed.json.notes[0].title, '来自工具的一条便签')
  })

  it('任务工具 应该 与 REST 共用同一份数据（工具建任务 → 路由查）', async () => {
    const { ctx, collected } = fakeHost()
    await apply(ctx)
    const addTool = collected.tools.find(tool => tool.name === 'desk_task_add')
    assert.ok(addTool)
    const exec = { signal: AbortSignal.timeout(1_000) }
    const output = await addTool.execute({ title: '来自工具的任务', status: 'doing' }, exec)
    assert.equal(typeof output, 'string')
    assert.equal(JSON.parse(output).ok, true)

    const listed = await callRoute(collected.routes[0].handler, {
      method: 'GET',
      url: `${ROUTES.tasks}?status=doing`,
      headers: { host: '127.0.0.1:3080' },
    })
    assert.equal(listed.json.tasks.length, 1)
    assert.equal(listed.json.tasks[0].title, '来自工具的任务')
  })
})
