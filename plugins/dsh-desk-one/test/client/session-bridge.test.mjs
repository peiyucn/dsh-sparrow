// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createSessionLinkBridge } from '../../lib/client/sessions/bridge.js'

/** Minimal fake of the two client stores the bridge consumes. */
function fakeServices(initial = { archived: [] }) {
  const sessionListeners = new Set()
  const workspaceListeners = new Set()
  let archived = [...initial.archived]
  const rows = {
    titled: { id: 'titled', title: '标题会话', displayTitle: 'display 标题会话', running: true, updatedAt: 3 },
    child: { id: 'child', title: '你是负责……', displayTitle: '你是负责……', origin: 'subagent', parentId: 'titled', updatedAt: 2, projectionValues: { subagent: { mode: 'continuable', label: '子代理标签', seq: 0 } } },
    cold: { id: 'cold', displayTitle: 'pyai-meta-repo', updatedAt: 1 },
  }
  return {
    services: {
      sessions: {
        list: {
          getSnapshot: () => ({ ids: Object.keys(rows), byId: rows, phase: 'ready' }),
          subscribe: (listener) => { sessionListeners.add(listener); return () => sessionListeners.delete(listener) },
        },
      },
      workspaces: {
        list: {
          getSnapshot: () => ({ phase: 'ready', state: 'idle', archivedSessionIds: archived, items: [{ workspaceId: 'w1', title: 'Repo A', path: 'C:\\\\work\\\\repo-a', sessionIds: ['titled'] }] }),
          subscribe: (listener) => { workspaceListeners.add(listener); return () => workspaceListeners.delete(listener) },
        },
      },
      uiWorkspace: { openSession: () => {} },
    },
    setArchived(ids) {
      archived = [...ids]
      for (const listener of workspaceListeners) listener()
    },
    sessionListenerCount: () => sessionListeners.size,
    workspaceListenerCount: () => workspaceListeners.size,
  }
}

describe('desk-one 会话桥接', () => {
  it('标题优先级与输入框 @ 一致：title → 子代理 label → id', () => {
    const fake = fakeServices()
    const bridge = createSessionLinkBridge()
    bridge.attach(fake.services)
    const byId = new Map(bridge.api.list().sessions.map(session => [session.id, session]))
    assert.equal(byId.get('titled')?.title, '标题会话')
    assert.equal(byId.get('child')?.title, '子代理标签', '子代理优先取 subagent label（与 composer displayTitle 一致）')
    assert.equal(byId.get('child')?.parentId, 'titled', '父子关系透传给 Sessions 树')
    assert.deepEqual(bridge.api.list().workspaces.map(workspace => [workspace.id, workspace.title]), [['w1', 'Repo A']])
    assert.equal(byId.get('cold')?.title, 'cold', '冷会话没有 title 时不把 cwd 目录名当标题')
  })

  it('归档集变化会唤醒订阅者，状态立即更新', () => {
    const fake = fakeServices()
    const bridge = createSessionLinkBridge()
    let notifications = 0
    bridge.api.subscribe(() => { notifications += 1 })
    bridge.attach(fake.services)
    assert.equal(bridge.api.list().sessions.find(session => session.id === 'titled')?.availability, 'available')
    fake.setArchived(['titled'])
    assert.ok(notifications > 0)
    assert.equal(bridge.api.list().sessions.find(session => session.id === 'titled')?.availability, 'archived')
    fake.setArchived([])
    assert.equal(bridge.api.list().sessions.find(session => session.id === 'titled')?.availability, 'available')
  })

  it('detach 后取消两个订阅并回到禁用态', () => {
    const fake = fakeServices()
    const bridge = createSessionLinkBridge()
    const detach = bridge.attach(fake.services)
    assert.equal(fake.sessionListenerCount(), 1)
    assert.equal(fake.workspaceListenerCount(), 1)
    detach()
    assert.equal(fake.sessionListenerCount(), 0)
    assert.equal(fake.workspaceListenerCount(), 0)
    assert.equal(bridge.api.list().enabled, false)
  })
})
