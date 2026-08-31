import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LlmError } from '@deepseek-ai/dsh-llm'
import {
  classifyUpstreamError, decodeFileIdParam, DSH_OWNED_FILE_PREFIX, formatBytes, formatTimestamp,
  normalizePageQuery, PAGE_SIZE, toFileRow,
} from '../lib/files.js'

describe('dsh-file-manage 纯逻辑', () => {
  describe('normalizePageQuery', () => {
    it('空参数 应该 返回默认分页（20 条、最新在前）', () => {
      assert.deepEqual(normalizePageQuery({}), { limit: PAGE_SIZE, order: 'desc' })
    })

    it('非法 limit（非整数 / 空 / 小数）应该 回退默认 20', () => {
      for (const bad of ['abc', '', '-3.5', '3.7', '1.5']) {
        assert.deepEqual(normalizePageQuery({ limit: bad }), { limit: PAGE_SIZE, order: 'desc' })
      }
    })

    it('limit 应该 钳到 [1, 1000]（官方上限）', () => {
      assert.equal(normalizePageQuery({ limit: '0' }).limit, 1)
      assert.equal(normalizePageQuery({ limit: '1' }).limit, 1)
      assert.equal(normalizePageQuery({ limit: '500' }).limit, 500)
      assert.equal(normalizePageQuery({ limit: '99999' }).limit, 1000)
    })

    it('空 after 应该 省略、非空保留；order 非 asc 一律 desc', () => {
      assert.deepEqual(normalizePageQuery({ after: '' }), { limit: PAGE_SIZE, order: 'desc' })
      assert.deepEqual(normalizePageQuery({ after: 'file-api-x' }), { after: 'file-api-x', limit: PAGE_SIZE, order: 'desc' })
      assert.equal(normalizePageQuery({ order: 'asc' }).order, 'asc')
      assert.equal(normalizePageQuery({ order: 'DESC' }).order, 'desc')
      assert.equal(normalizePageQuery({ order: 'whatever' }).order, 'desc')
    })
  })

  describe('formatBytes', () => {
    it('B 档 应该 显示整数 B', () => {
      assert.equal(formatBytes(0), '0 B')
      assert.equal(formatBytes(512), '512 B')
      assert.equal(formatBytes(1023), '1023 B')
    })

    it('KiB / MiB / GiB 档 应该 一位小数（≥100 取整）', () => {
      assert.equal(formatBytes(1024), '1.0 KiB')
      assert.equal(formatBytes(1536), '1.5 KiB')
      assert.equal(formatBytes(2 * 1024 * 1024), '2.0 MiB')
      assert.equal(formatBytes(120 * 1024 * 1024), '120 MiB')
      assert.equal(formatBytes(25 * 1024 * 1024 * 1024), '25.0 GiB')
    })

    it('异常输入 应该 返回 0 B', () => {
      assert.equal(formatBytes(-1), '0 B')
      assert.equal(formatBytes(Number.NaN), '0 B')
    })
  })

  describe('formatTimestamp', () => {
    it('合法 Unix 秒 应该 输出 YYYY-MM-DD HH:mm', () => {
      assert.match(formatTimestamp(1700000000), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    })

    it('异常输入 应该 返回占位符', () => {
      assert.equal(formatTimestamp(-1), '—')
      assert.equal(formatTimestamp(Number.NaN), '—')
    })
  })

  describe('toFileRow', () => {
    it('普通文件 应该 格式化标签且不标 dsh 角标', () => {
      const row = toFileRow({ id: 'file-api-one', bytes: 1024, createdAt: 1700000000, filename: 'photo.png', purpose: 'user_data' })
      assert.equal(row.id, 'file-api-one')
      assert.equal(row.filename, 'photo.png')
      assert.equal(row.bytes, 1024)
      assert.equal(row.sizeLabel, '1.0 KiB')
      assert.match(row.createdAtLabel, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
      assert.equal(row.expiresAtLabel, undefined)
      assert.equal(row.dshOwned, false)
    })

    it('dsh- 前缀文件 应该 标自动上传角标', () => {
      const row = toFileRow({ id: 'file-api-x', bytes: 1, createdAt: 1, filename: DSH_OWNED_FILE_PREFIX + 'abc.png', purpose: 'user_data' })
      assert.equal(row.dshOwned, true)
      assert.equal(row.bytes, 1)
    })

    it('带到期时间的文件 应该 输出到期标签', () => {
      const row = toFileRow({ id: 'file-api-y', bytes: 1, createdAt: 1, filename: 'a.png', purpose: 'user_data', expiresAt: 1700000000 })
      assert.match(row.expiresAtLabel ?? '', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    })
  })

  describe('decodeFileIdParam', () => {
    it('合法编码 应该 原样解码', () => {
      assert.equal(decodeFileIdParam('file-api-one'), 'file-api-one')
      assert.equal(decodeFileIdParam('file-api%2Done'), 'file-api-one')
    })

    it('畸形百分号编码 应该 返回空串（不抛 URIError）', () => {
      assert.equal(decodeFileIdParam('%zz'), '')
      assert.equal(decodeFileIdParam('%E0%A4%A'), '')
    })
  })

  describe('classifyUpstreamError', () => {
    it('官方 AUTH 应该 归为 401', () => {
      const info = classifyUpstreamError(new LlmError('bad key', 'AUTH'))
      assert.deepEqual(info, { code: 'AUTH', status: 401, message: '鉴权失败：DeepSeek API key 无效或已失效' })
    })

    it('官方 RATE_LIMIT 应该 归为 429', () => {
      const info = classifyUpstreamError(new LlmError('slow down', 'RATE_LIMIT'))
      assert.equal(info.code, 'RATE_LIMIT')
      assert.equal(info.status, 429)
    })

    it('官方 SERVER 应该 归为 502', () => {
      const info = classifyUpstreamError(new LlmError('boom', 'SERVER'))
      assert.equal(info.code, 'SERVER')
      assert.equal(info.status, 502)
    })

    it('官方 FILES_API 应该 归为 400 并透传消息', () => {
      const info = classifyUpstreamError(new LlmError('file gone', 'FILES_API'))
      assert.deepEqual(info, { code: 'FILES_API', status: 400, message: 'file gone' })
    })

    it('其它 LlmError 码（TRANSPORT 等）应该 归为 UPSTREAM 502', () => {
      const info = classifyUpstreamError(new LlmError('timeout', 'TRANSPORT'))
      assert.deepEqual(info, { code: 'UPSTREAM', status: 502, message: '上游请求失败，请稍后重试' })
    })

    it('未知错误 应该 归为 UPSTREAM 502', () => {
      assert.deepEqual(classifyUpstreamError(new Error('x')), { code: 'UPSTREAM', status: 502, message: '上游请求失败，请稍后重试' })
      assert.equal(classifyUpstreamError('oops').status, 502)
    })
  })
})
