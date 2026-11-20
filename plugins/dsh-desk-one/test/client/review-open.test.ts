import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createReviewBridge } from '../../lib/client/notebook/review-bridge.js'
import { persistReviewSession } from '../../lib/client/notebook/review/sessions.js'

const input = { path: 'notes/a.md', fileId: 'file-open-test', workspaceId: 'w1' }

function fakeSidebar(initialMounted = 'current-session') {
  const opened: Array<{ kind: string; params: unknown }> = []
  let mounted: string | undefined = initialMounted
  return {
    opened,
    setMounted: (next: string | undefined) => { mounted = next },
    openTab: (kind: string, options?: { params?: unknown }) => {
      opened.push({ kind, params: options?.params })
    },
    mounted: { getSnapshot: () => mounted },
  }
}

function fakeSessions(ids: string[]) {
  return {
    scope: () => undefined,
    list: {
      getSnapshot: () => ({
        ids,
        projectionsBySession: Object.fromEntries(ids.map(id => [id, { values: { sessionStats: { turns: 0 } } }])),
      }),
    },
    refreshProjections: async () => undefined,
  }
}

function fakeWorkspaces() {
  return { list: { getSnapshot: () => ({ archivedSessionIds: [] }) } }
}

function fakeNavigation() {
  const calls: string[] = []
  let workspaceCallback: ((sessionId: string) => void) | undefined
  return {
    calls,
    openSession: (sessionId: string) => { calls.push('openSession:' + sessionId) },
    openWorkspace: async (_workspaceId: string, beforeOpen?: (sessionId: string) => void) => {
      calls.push('openWorkspace')
      workspaceCallback = beforeOpen
      beforeOpen?.('created-session')
    },
    startSession: () => { calls.push('startSession') },
    get workspaceCallback() { return workspaceCallback },
  }
}

const notebook = {
  listReviewSessions: async () => ({ sessionIds: [] }),
  markReviewSession: async () => undefined,
  unmarkReviewSession: async () => undefined,
}

describe('审阅打开模式', () => {
  it('current 在当前会话打开，不要求导航服务，也不建新会话', async () => {
    const sidebar = fakeSidebar()
    const bridge = createReviewBridge()
    bridge.attachSidebar(sidebar as never)
    const result = await bridge.open(input, { mode: 'current' })
    assert.equal(result.ok, true)
    assert.equal(sidebar.opened.length, 1)
    assert.equal(sidebar.opened[0].kind, 'note-review')
    assert.deepEqual(sidebar.opened[0].params, input)
    assert.equal((sidebar.opened[0].params as Record<string, unknown>).markOnOpen, undefined)
  })

  it('new 总是新建会话，并让审阅 tab 在打开时标记', async () => {
    const sidebar = fakeSidebar()
    const nav = fakeNavigation()
    const bridge = createReviewBridge()
    bridge.attachSidebar(sidebar as never)
    bridge.attachSessions(fakeSessions([]) as never)
    bridge.attachWorkspaces(fakeWorkspaces() as never)
    bridge.attachNavigation(nav as never)
    const result = await bridge.open(input, { mode: 'new' })
    assert.equal(result.ok, true)
    assert.deepEqual(nav.calls, ['openWorkspace'])
    assert.equal(sidebar.opened.length, 1)
    assert.equal((sidebar.opened[0].params as Record<string, unknown>).markOnOpen, true)
  })

  it('reuse 有可复用审阅会话时切过去，不新建、不标记', async () => {
    const fileId = 'file-reuse-test'
    persistReviewSession(notebook as never, { sessionId: 'reuse-session', workspaceId: 'w1', fileId })
    const sidebar = fakeSidebar('reuse-session')
    const nav = fakeNavigation()
    const bridge = createReviewBridge()
    bridge.attachSidebar(sidebar as never)
    bridge.attachSessions(fakeSessions(['reuse-session']) as never)
    bridge.attachWorkspaces(fakeWorkspaces() as never)
    bridge.attachNavigation(nav as never)
    const result = await bridge.open({ ...input, fileId })
    assert.equal(result.ok, true)
    assert.deepEqual(nav.calls, ['openSession:reuse-session'])
    assert.equal((sidebar.opened[0].params as Record<string, unknown>).markOnOpen, undefined)
  })

  it('reuse 没有可复用会话时新建并标记', async () => {
    const sidebar = fakeSidebar()
    const nav = fakeNavigation()
    const bridge = createReviewBridge()
    bridge.attachSidebar(sidebar as never)
    bridge.attachSessions(fakeSessions([]) as never)
    bridge.attachWorkspaces(fakeWorkspaces() as never)
    bridge.attachNavigation(nav as never)
    const result = await bridge.open({ ...input, fileId: 'file-no-reuse' })
    assert.equal(result.ok, true)
    assert.deepEqual(nav.calls, ['openWorkspace'])
    assert.equal((sidebar.opened[0].params as Record<string, unknown>).markOnOpen, true)
  })
})
