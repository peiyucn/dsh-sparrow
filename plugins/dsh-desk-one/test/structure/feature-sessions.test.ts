

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DESK_DOMAIN } from '../../lib/host/domain.js'
import { SESSION_STREAM_PAGE_SIZE } from '../../lib/constants.js'
import { PREFIX as SESSIONS_PREFIX, ROUTES as SESSION_ROUTES } from '../../lib/host/sessions/constants.js'
import { hasSessionServices, installSessionsHost } from '../../lib/host/sessions/install.js'
import { sessionsArchiveApi } from '../../lib/client/sessions/archiveApi.js'
import { createSessionLinkBridge } from '../../lib/client/sessions/bridge.js'

describe('会话归档契约', () => {
  it('会话归档 REST 路由应该全部挂在统一前缀下，覆盖归档 / 回收站 / 还原 / 彻底删除', () => {
    const paths = Object.values(SESSION_ROUTES)
    assert.deepEqual(paths.filter(path => !path.startsWith(`${SESSIONS_PREFIX}/`)), [], '所有会话路由必须在 /api/desk-one/sessions 前缀下')
    for (const key of [
      'list',
      'strays',
      'trash',
      'trashDir',
      'unarchive',
      'archive',
      'delete',
      'trashDelete',
      'restore',
      'trashRestoreAll',
      'trashDeleteAll',
    ]) {
      assert.equal(typeof SESSION_ROUTES[key], 'string', `会话路由表缺 ${key}（归档 / 回收站管理面不完整）`)
    }
    assert.equal(new Set(paths).size, paths.length, '会话路由不得重复')
  })

  it('客户端归档管理面应该暴露全部分区动作', () => {
    for (const action of [
      'list',
      'strays',
      'trash',
      'trashDir',
      'unarchive',
      'archive',
      'moveToTrash',
      'deleteSession',
      'restore',
      'restoreAll',
      'deleteTrashEntry',
      'deleteAllTrash',
    ]) {
      assert.equal(typeof sessionsArchiveApi[action], 'function', `客户端归档 API 缺 ${action}`)
    }
  })

  it('会话服务是可选能力：宿主缺服务时跳过会话功能而不是让整只插件停用', () => {
    assert.equal(hasSessionServices( ({})), false)
    const complete = {
      sessions: { get: () => ({}) },
      agents: {},
      workspaceRegistry: {},
      sessionPersistence: { list: async () => [] },
      sessionQuery: {},
      storageDomain: { open: async () => ({}) },
      webServer: { register: () => {} },
    }
    assert.equal(hasSessionServices( (complete)), true, '服务齐全时应启用会话归档')
    for (const missing of ['sessions', 'agents', 'workspaceRegistry', 'sessionPersistence', 'sessionQuery', 'storageDomain', 'webServer']) {
      const partial = { ...complete, [missing]: undefined }
      assert.equal(hasSessionServices( (partial)), false, `缺 ${missing} 时不得假装可用`)
    }
    assert.equal(typeof installSessionsHost, 'function')
  })

  it('任务卡会话关联 facade：没有宿主服务时降级 disabled，attach 后恢复', () => {
    const bridge = createSessionLinkBridge()
    assert.equal(bridge.api.list().enabled, false, '未 attach 时必须处于 disabled 降级态')
    assert.deepEqual(bridge.api.list(), { enabled: false, sessions: [], workspaces: [] })
    assert.doesNotThrow(() => bridge.api.open('missing-session'), 'disabled 时打开会话必须是 no-op')
    assert.equal(typeof bridge.attach, 'function')

    const detach = bridge.attach( ({
      sessions: {
        list: {
          getSnapshot: () => ({
            ids: ['session_1'],
            byId: { session_1: { id: 'session_1', title: 'Hello', running: true, updatedAt: 5 } },
          }),
          subscribe: () => () => {},
        },
      },
      workspaces: {
        list: { getSnapshot: () => ({ items: [{ workspaceId: 'ws_1', title: 'Workspace', path: '/tmp/ws', sessionIds: ['session_1'] }] }), subscribe: () => () => {} },
      },
      uiWorkspace: { openSession: () => {} },
    }))
    const snapshot = bridge.api.list()
    assert.equal(snapshot.enabled, true, 'attach 后必须启用')
    assert.equal(snapshot.sessions.length, 1)
    assert.equal(snapshot.sessions[0].title, 'Hello')
    assert.equal(snapshot.workspaces.length, 1)
    detach()
    assert.equal(bridge.api.list().enabled, false, 'detach 后回到 disabled 降级态')
  })

  it('分区加载更多使用共享分页常量', () => {
    assert.equal(SESSION_STREAM_PAGE_SIZE, 10, '归档 / 游离 / 回收站默认每区加载 10 行')
  })

  it('会话索引节点按 kind 解析，可用性枚举受限', () => {
    const nodeSchema =  (DESK_DOMAIN.tables.nodes.valueSchema)
    const record = {
      id: 'session_index_1',
      kind: 'session',
      schema: 1,
      sessionId: 'session_1',
      title: 'session',
      subagent: false,
      running: false,
      availability: 'available',
      updatedAt: 1,
      indexedAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      revision: 0,
    }
    assert.equal(nodeSchema.safeParse(record).success, true)
    assert.equal(nodeSchema.safeParse({ ...record, availability: 'gone' }).success, false, '可用性只有 available / archived / missing')
    assert.equal(nodeSchema.safeParse({ ...record, subagent: undefined }).success, false, '子会话标记是必填')
  })
})
