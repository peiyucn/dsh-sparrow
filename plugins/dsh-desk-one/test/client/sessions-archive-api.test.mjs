// @ts-check
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { sessionsArchiveApi } from '../../lib/client/sessions/archiveApi.js'

/** Capture fetch calls and return a JSON response body. */
function stubFetch(body, init = {}) {
  /** @type {Array<{ url: string, method: string, body: string }>} */
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: String(options.method ?? 'GET'), body: String(options.body ?? '') })
    return new Response(JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  return { calls, restore: () => { globalThis.fetch = original } }
}

const restores = []
afterEach(() => {
  for (const restore of restores.splice(0)) restore()
})

describe('sessions archive client API', () => {
  it('读取路由走 /api/desk-one/sessions 前缀', async () => {
    const stub = stubFetch({ tree: [] })
    restores.push(stub.restore)
    const tree = await sessionsArchiveApi.list()
    assert.deepEqual([...tree], [])
    assert.equal(stub.calls[0]?.url, '/api/desk-one/sessions/list')
    assert.equal(stub.calls[0]?.method, 'GET')
  })

  it('归档 / 取消归档 / 还原使用 POST 与 JSON body', async () => {
    const stub = stubFetch({ ok: true })
    restores.push(stub.restore)
    await sessionsArchiveApi.unarchive('s-1')
    await sessionsArchiveApi.archive('s-2')
    await sessionsArchiveApi.restore('t-1')
    assert.deepEqual(stub.calls.map(call => [call.url, call.method, JSON.parse(call.body)]), [
      ['/api/desk-one/sessions/unarchive', 'POST', { sessionId: 's-1' }],
      ['/api/desk-one/sessions/archive', 'POST', { sessionId: 's-2' }],
      ['/api/desk-one/sessions/restore', 'POST', { trashId: 't-1' }],
    ])
  })

  it('破坏性操作带上确认字段', async () => {
    const stub = stubFetch({ ok: true, trashId: 't-1', workspaceIds: [], subagentIds: [] })
    restores.push(stub.restore)
    await sessionsArchiveApi.moveToTrash('s-1')
    await sessionsArchiveApi.restoreAll()
    await sessionsArchiveApi.deleteTrashEntry('t-2')
    await sessionsArchiveApi.deleteAllTrash()
    assert.deepEqual(stub.calls.map(call => [call.url.split('/').pop(), JSON.parse(call.body)]), [
      ['trash', { sessionId: 's-1', confirm: true }],
      ['trash-restore-all', { confirm: true }],
      ['trash-delete', { trashId: 't-2', confirm: true }],
      ['trash-delete-all', { confirm: true }],
    ])
  })

  it('非 2xx 时抛出服务端 message，便于界面显示', async () => {
    const stub = stubFetch({ error: { code: 'CONFIRMATION_FAILED', message: '删除确认失败：请输入完整会话标题' } }, { status: 400 })
    restores.push(stub.restore)
    await assert.rejects(
      sessionsArchiveApi.deleteSession({ sessionId: 's-1', confirmTitle: '错' }),
      /请输入完整会话标题/u,
    )
  })
})
