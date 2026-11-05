// @ts-check
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { describe, it } from 'node:test'
import { DeskModelError } from '../lib/model.js'
import { createDeskRequestHandler } from '../lib/host/routes.js'
import { ROUTES } from '../lib/constants.js'

/** 最小 Context 桩：路由只用到 logger 与可选服务读取。 */
const fakeContext = () => ({
  logger: { warn: () => {}, info: () => {} },
  get: () => undefined,
})

/** 最小响应桩：把 statusCode / headersSent 暴露回读，并收集 JSON body。 */
const fakeResponse = () => {
  const result = { statusCode: 0, headers: {}, body: '', headersSent: false }
  return {
    get headersSent() { return result.headersSent },
    get statusCode() { return result.statusCode },
    set statusCode(value) { result.statusCode = value },
    get body() { return result.body },
    setHeader(name, value) { result.headers[name] = value },
    end(chunk) {
      result.headersSent = true
      result.body = chunk
    },
  }
}

/**
 * 构造一条 IncomingMessage 形状的请求（Readable 即可被 for await 读取）。
 * @param {{ method: string, url: string, body?: string, headers?: Record<string, string> }} spec
 */
const fakeRequest = ({ method, url, body, headers = {} }) => {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(body)])
  return Object.assign(stream, { method, url, headers })
}

const callHandler = async (handler, request) => {
  const res = fakeResponse()
  await handler(request, res)
  return { status: res.statusCode, json: JSON.parse(res.body ?? '{}') }
}

describe('desk-one REST 路由', () => {
  it('GET /notes 应该 返回列表（loopback 请求）', async () => {
    const notes = [{ id: 'note_1', title: 'x' }]
    const handler = createDeskRequestHandler({
      ctx: fakeContext(),
      store: {
        listNotes: (query) => notes.filter(() => query === undefined || query === 'x'),
        createNote: async () => { throw new Error('unused') },
        updateNote: async () => { throw new Error('unused') },
        deleteNote: async () => { throw new Error('unused') },
      },
    })
    const response = await callHandler(handler, fakeRequest({
      method: 'GET',
      url: `${ROUTES.notes}?q=x`,
      headers: { host: '127.0.0.1:3080' },
    }))
    assert.equal(response.status, 200)
    assert.deepEqual(response.json.notes, notes)
  })

  it('POST /notes 应该 创建并返回 201', async () => {
    const created = { id: 'note_2', title: 'hello' }
    const handler = createDeskRequestHandler({
      ctx: fakeContext(),
      store: {
        listNotes: () => [],
        createNote: async (raw) => {
          assert.equal(raw.title, 'hello')
          return created
        },
        updateNote: async () => { throw new Error('unused') },
        deleteNote: async () => { throw new Error('unused') },
      },
    })
    const response = await callHandler(handler, fakeRequest({
      method: 'POST',
      url: ROUTES.notes,
      body: JSON.stringify({ title: 'hello' }),
      headers: { host: 'localhost:3080', 'content-type': 'application/json' },
    }))
    assert.equal(response.status, 201)
    assert.deepEqual(response.json.note, created)
  })

  it('非本机同源请求 应该 403（先于一切路由）', async () => {
    const handler = createDeskRequestHandler({
      ctx: fakeContext(),
      store: {
        listNotes: () => [], createNote: async () => { throw new Error('unused') },
        updateNote: async () => { throw new Error('unused') }, deleteNote: async () => { throw new Error('unused') },
      },
    })
    const response = await callHandler(handler, fakeRequest({
      method: 'GET',
      url: ROUTES.notes,
      headers: { host: 'evil.example:3080' },
    }))
    assert.equal(response.status, 403)
    assert.equal(response.json.error.code, 'FORBIDDEN')
  })

  it('未知路由 应该 404', async () => {
    const handler = createDeskRequestHandler({
      ctx: fakeContext(),
      store: {
        listNotes: () => [], createNote: async () => { throw new Error('unused') },
        updateNote: async () => { throw new Error('unused') }, deleteNote: async () => { throw new Error('unused') },
      },
    })
    const response = await callHandler(handler, fakeRequest({
      method: 'GET',
      url: '/api/desk-one/nope',
      headers: { host: '127.0.0.1:3080' },
    }))
    assert.equal(response.status, 404)
  })

  it('revision 冲突 应该 映射 409；未知便签 应该 映射 404', async () => {
    const makeHandler = (error) => createDeskRequestHandler({
      ctx: fakeContext(),
      store: {
        listNotes: () => [], createNote: async () => { throw new Error('unused') },
        updateNote: async () => { throw error }, deleteNote: async () => { throw error },
      },
    })
    const conflict = await callHandler(makeHandler(new DeskModelError('REVISION_CONFLICT', '冲突')), fakeRequest({
      method: 'POST',
      url: ROUTES.noteUpdate,
      body: JSON.stringify({ id: 'note_1', expectedRevision: 1, patch: {} }),
      headers: { host: '127.0.0.1:3080' },
    }))
    assert.equal(conflict.status, 409)
    assert.equal(conflict.json.error.code, 'REVISION_CONFLICT')

    const missing = await callHandler(makeHandler(new DeskModelError('UNKNOWN_NOTE', '不存在')), fakeRequest({
      method: 'POST',
      url: ROUTES.noteDelete,
      body: JSON.stringify({ id: 'note_x' }),
      headers: { host: '127.0.0.1:3080' },
    }))
    assert.equal(missing.status, 404)
    assert.equal(missing.json.error.code, 'UNKNOWN_NOTE')
  })

  it('非法 JSON / 缺字段 应该 400', async () => {
    const handler = createDeskRequestHandler({
      ctx: fakeContext(),
      store: {
        listNotes: () => [], createNote: async () => { throw new Error('unused') },
        updateNote: async () => { throw new Error('unused') }, deleteNote: async () => { throw new Error('unused') },
      },
    })
    const response = await callHandler(handler, fakeRequest({
      method: 'POST',
      url: ROUTES.noteDelete,
      body: '{bad json',
      headers: { host: '127.0.0.1:3080' },
    }))
    assert.equal(response.status, 400)
    assert.equal(response.json.error.code, 'BAD_BODY')
  })
})
