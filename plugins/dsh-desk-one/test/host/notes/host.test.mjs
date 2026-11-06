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
  it('入口 应该 导出 name / inject 三个硬依赖服务', () => {
    assert.equal(name, 'dsh-desk-one')
    assert.deepEqual(inject, ['webServer', 'storageDomain', 'tools'])
  })

  it('apply 应该 打开存储域、挂前缀路由、注册 4 个 agent 工具', async () => {
    const { ctx, collected } = fakeHost()
    await apply(ctx)
    assert.equal(collected.routes.length, 1)
    assert.equal(collected.routes[0].kind, 'prefix')
    assert.equal(collected.routes[0].path, '/api/desk-one')
    assert.deepEqual(
      collected.tools.map(tool => tool.name).sort(),
      ['desk_note_add', 'desk_note_delete', 'desk_note_list', 'desk_note_update'],
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
})
