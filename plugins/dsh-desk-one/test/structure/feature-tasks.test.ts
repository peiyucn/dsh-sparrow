

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DESK_DOMAIN } from '../../lib/host/domain.js'
import { MAX_TASK_SESSIONS, PREFIX, ROUTES, TASK_STATUSES } from '../../lib/constants.js'
import { DeskStore } from '../../lib/host/store.js'
import { TASK_ROUTES } from '../../lib/host/tasks/routes.js'
import { GROUP_ROUTES } from '../../lib/host/tasks/group-routes.js'
import { registerTaskTools } from '../../lib/host/tasks/tools.js'
import { registerGroupTools } from '../../lib/host/tasks/group-tools.js'
import * as taskApi from '../../lib/client/tasks/api.js'
import { collectToolNames } from './helpers.ts'


const nodeSchema = DESK_DOMAIN.tables.nodes.valueSchema

function taskRecord(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'task_1',
    kind: 'task',
    schema: 1,
    title: 'task',
    body: '',
    tags: [],
    status: 'todo',
    color: 'default',
    order: 0,
    sessionIds: [],
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    revision: 1,
    ...overrides,
  }
}

function groupRecord(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'group_1',
    kind: 'group',
    schema: 1,
    name: 'group',
    status: 'todo',
    order: 0,
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    revision: 1,
    ...overrides,
  }
}

describe('任务板契约', () => {
  it('任务固定三泳道', () => {
    assert.deepEqual([...TASK_STATUSES], ['todo', 'doing', 'done'])
    for (const status of TASK_STATUSES) {
      assert.equal(nodeSchema.safeParse(taskRecord({ status })).success, true, `泳道 ${status} 必须可解析`)
    }
    assert.equal(nodeSchema.safeParse(taskRecord({ status: 'later' })).success, false, '未知泳道必须被拒绝')
  })

  it('任务与分组 REST 路由应该全部挂在统一前缀下并覆盖契约端点', () => {
    const routes = [...TASK_ROUTES, ...GROUP_ROUTES]
    const paths = routes.map(route => route.path)
    assert.deepEqual(paths.filter(path => !path.startsWith(`${PREFIX}/`)), [], '所有路由必须在 /api/desk-one 前缀下')
    for (const required of [
      ROUTES.tasks,
      ROUTES.taskUpdate,
      ROUTES.taskDelete,
      ROUTES.groups,
      ROUTES.groupUpdate,
      ROUTES.groupMove,
      ROUTES.groupArchive,
      ROUTES.groupDelete,
    ]) {
      assert.ok(paths.includes(required), `任务 / 分组路由缺 ${required}`)
    }
    const keys = routes.map(route => `${route.method} ${route.path}`)
    assert.equal(new Set(keys).size, keys.length, '路由表不得有重复的 method + path')
  })

  it('任务与分组的 agent 工具应该齐全', () => {
    assert.deepEqual(collectToolNames(registerTaskTools, {}), [
      'desk_task_add',
      'desk_task_archive',
      'desk_task_complete',
      'desk_task_delete',
      'desk_task_list',
      'desk_task_update',
    ])
    assert.deepEqual(collectToolNames(registerGroupTools, {}), [
      'desk_group_add',
      'desk_group_archive',
      'desk_group_delete',
      'desk_group_list',
      'desk_group_move',
      'desk_group_update',
    ])
  })

  it('分组是宿主实体：store 提供级联方法，客户端数据面暴露分组动作', () => {
    for (const method of ['moveGroup', 'archiveGroup', 'deleteGroup']) {
      assert.equal(typeof DeskStore.prototype[method], 'function', `DeskStore 缺级联方法 ${method}`)
    }
    for (const method of ['createTask', 'updateTask', 'listTasks']) {
      assert.equal(typeof DeskStore.prototype[method], 'function', `DeskStore 缺任务方法 ${method}`)
    }
    for (const action of [
      'listTasks',
      'createTask',
      'updateTask',
      'deleteTask',
      'listGroups',
      'createGroup',
      'updateGroup',
      'moveGroup',
      'archiveGroup',
      'deleteGroup',
    ]) {
      assert.equal(typeof taskApi[action], 'function', `客户端任务 API 缺 ${action}`)
    }
  })

  it('任务卡关联会话：多对多列表有上限，旧记录字段有默认值', () => {
    assert.equal(MAX_TASK_SESSIONS, 10, '一张卡最多关联 10 个会话（UI 是 chip 行）')
    const maxSessions = taskRecord({ sessionIds: Array.from({ length: MAX_TASK_SESSIONS }, (_, index) => `session_${index}`) })
    assert.equal(nodeSchema.safeParse(maxSessions).success, true, '上限内的会话列表必须可解析')
    const tooMany = taskRecord({ sessionIds: Array.from({ length: MAX_TASK_SESSIONS + 1 }, (_, index) => `session_${index}`) })
    assert.equal(nodeSchema.safeParse(tooMany).success, false, '超过上限必须被拒绝')

    const legacy = taskRecord()
    delete legacy.sessionIds
    delete legacy.archived
    const parsed = nodeSchema.parse(legacy) as { sessionIds: string[], archived: boolean }
    assert.deepEqual(parsed.sessionIds, [], '旧记录没有 sessionIds 时应默认空列表')
    assert.equal(parsed.archived, false, '旧记录没有 archived 时应默认 false')
    assert.equal(nodeSchema.safeParse(taskRecord({ groupId: 'group_1' })).success, true, '分组用 groupId 记录成员关系')
    assert.equal(nodeSchema.safeParse(groupRecord()).success, true, '分组是独立节点')
  })
})
