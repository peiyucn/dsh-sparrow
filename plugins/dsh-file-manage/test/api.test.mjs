import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { countApi, deleteApi, listApi } from '../lib/client/api.js'

/** fetch 桩调用记录与可编程响应；用例按需替换 impl。
 * node:test 每个测试文件独立进程，直接替换 globalThis.fetch 即可，无需还原。 */
const calls = []
let impl = async () => { throw new Error('fetch 桩未配置') }

globalThis.fetch = async (url, init) => {
  calls.push({ url, init })
  return impl()
}

afterEach(() => {
  calls.length = 0
})

/** 构造可编程 Response 桩（body 传 Error 时 json() 抛错，模拟非 JSON 响应体）。 */
function responseStub(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

describe('dsh-file-manage 客户端请求层', () => {
  describe('listApi', () => {
    it('成功 应该 透传行与游标字段', async () => {
      const rows = [{ id: 'file-api-a', filename: 'a.png', bytes: 1, sizeLabel: '1 B', createdAtLabel: 'x', dshOwned: false }]
      impl = async () => responseStub(200, { items: rows, hasMore: true, lastId: 'file-api-z' })
      const page = await listApi()
      assert.deepEqual(page.rows, rows)
      assert.equal(page.hasMore, true)
      assert.equal(page.lastId, 'file-api-z')
      assert.equal(calls[0].url, '/api/file-manage/list?')
    })

    it('带 after 参数 应该 拼进查询串', async () => {
      impl = async () => responseStub(200, { items: [], hasMore: false })
      await listApi('file-api-one')
      assert.equal(calls[0].url, '/api/file-manage/list?after=file-api-one')
    })

    it('JSON 错误体 应该 提取 message 抛错', async () => {
      impl = async () => responseStub(401, { error: { code: 'AUTH', message: 'bad key' } })
      await assert.rejects(listApi(), /bad key/u)
    })

    it('非 JSON 错误体（代理错误页）应该 回退 HTTP 状态文案', async () => {
      impl = async () => responseStub(500, new SyntaxError('not json'))
      await assert.rejects(listApi(), /请求失败（HTTP 500）/u)
    })

    it('成功但响应体非 JSON 应该 返回安全默认值（空列表）', async () => {
      impl = async () => responseStub(200, new SyntaxError('not json'))
      const page = await listApi()
      assert.deepEqual(page.rows, [])
      assert.equal(page.hasMore, false)
      assert.equal(page.lastId, undefined)
    })

    it('fetch 中止 应该 转为用户可读超时文案', async () => {
      impl = async () => { throw new DOMException('The operation was aborted.', 'AbortError') }
      await assert.rejects(listApi(), /请求超时（15s），请重试/u)
    })
  })

  describe('countApi', () => {
    it('成功 应该 返回完整配额汇总', async () => {
      impl = async () => responseStub(200, {
        count: 3, totalBytes: 1024, totalBytesLabel: '1.0 KiB',
        quotaBytes: 100, quotaBytesLabel: '100 B', quotaCount: 10000,
      })
      assert.deepEqual(await countApi(), {
        count: 3, totalBytes: 1024, totalBytesLabel: '1.0 KiB',
        quotaBytes: 100, quotaBytesLabel: '100 B', quotaCount: 10000,
      })
      assert.equal(calls[0].url, '/api/file-manage/count')
    })

    it('字段缺失 应该 返回安全默认值（0 / 0 B）', async () => {
      impl = async () => responseStub(200, {})
      assert.deepEqual(await countApi(), {
        count: 0, totalBytes: 0, totalBytesLabel: '0 B',
        quotaBytes: 0, quotaBytesLabel: '0 B', quotaCount: 0,
      })
    })

    it('错误 应该 提取 message 抛错', async () => {
      impl = async () => responseStub(429, { error: { message: 'slow down' } })
      await assert.rejects(countApi(), /slow down/u)
    })
  })

  describe('deleteApi', () => {
    it('成功 应该 以 DELETE 方法与编码 id 请求', async () => {
      impl = async () => responseStub(200, { deleted: true, id: 'file-api-one' })
      await deleteApi('file-api-one')
      assert.equal(calls[0].url, '/api/file-manage/files?id=file-api-one')
      assert.equal(calls[0].init.method, 'DELETE')
    })

    it('错误 应该 抛用户可读文案', async () => {
      impl = async () => responseStub(400, { error: { message: 'missing id' } })
      await assert.rejects(deleteApi('x'), /missing id/u)
    })
  })
})
