import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isDeleteConfirmationSufficient, normalizeArchiveConfig, parseBackupSidecar,
  sanitizeSegment, TitleCache,
} from '../lib/archive.js'

describe('archive-session 纯逻辑', () => {
  describe('normalizeArchiveConfig', () => {
    it('空配置 应该 提供默认 TTL 与容量', () => {
      const config = normalizeArchiveConfig(undefined)
      assert.equal(config.titleCacheTtlMs, 60_000)
      assert.equal(config.titleCacheMaxEntries, 256)
      assert.match(config.backupRoot, /dsh-archive-session-backup/u)
    })

    it('非法 TTL 应该 抛错', () => {
      assert.throws(() => normalizeArchiveConfig({ titleCacheTtlMs: 0 }), /titleCacheTtlMs/u)
    })
  })

  describe('isDeleteConfirmationSufficient', () => {
    it('逐字一致 应该 通过强确认', () => {
      assert.equal(isDeleteConfirmationSufficient(' 会话标题 ', '会话标题'), true)
    })

    it('不一致 应该 拒绝', () => {
      assert.equal(isDeleteConfirmationSufficient('a', 'b'), false)
    })

    it('空标题 应该 拒绝', () => {
      assert.equal(isDeleteConfirmationSufficient('', ''), false)
    })
  })

  describe('sanitizeSegment', () => {
    it('危险字符 应该 替换为下划线', () => {
      assert.equal(sanitizeSegment('../../a b'), '______a_b')
    })

    it('空串 应该 返回 unknown', () => {
      assert.equal(sanitizeSegment('///'), 'unknown')
    })
  })

  describe('TitleCache', () => {
    it('TTL 内 应该 命中', () => {
      let now = 0
      const cache = new TitleCache(100, 2, () => now)
      cache.set('a', { status: 'fulfilled' })
      now = 99
      assert.deepEqual(cache.get('a'), { status: 'fulfilled' })
    })

    it('过期 应该 失效', () => {
      let now = 0
      const cache = new TitleCache(100, 2, () => now)
      cache.set('a', { status: 'fulfilled' })
      now = 100
      assert.equal(cache.get('a'), undefined)
    })

    it('超过容量 应该 逐出最久未用项', () => {
      const cache = new TitleCache(1000, 2, () => 0)
      cache.set('a', 1)
      cache.set('b', 2)
      cache.get('a')
      cache.set('c', 3)
      assert.equal(cache.get('b'), undefined)
      assert.equal(cache.get('a'), 1)
      assert.equal(cache.get('c'), 3)
    })
  })

  describe('parseBackupSidecar', () => {
    it('合法 sidecar 应该 返回结构化信息', () => {
      const sidecar = parseBackupSidecar({
        version: 1,
        sessionId: 's',
        title: 't',
        originalPath: 'C:/tmp/s',
        archivedAt: 'now',
        workspaceIds: ['w'],
      })
      assert.equal(sidecar?.sessionId, 's')
      assert.deepEqual(sidecar?.workspaceIds, ['w'])
    })

    it('缺少 originalPath 应该 返回 undefined', () => {
      assert.equal(parseBackupSidecar({ version: 1, sessionId: 's', archivedAt: 'now', workspaceIds: [] }), undefined)
    })
  })
})
