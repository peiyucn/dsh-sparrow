import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isDeleteConfirmationSufficient, legacyBackupItem, normalizeArchiveConfig, parseBackupSidecar,
  sanitizeSegment,
} from '../lib/archive.js'

describe('archive-session 纯逻辑', () => {
  describe('normalizeArchiveConfig', () => {
    it('空配置 应该 提供默认备份目录', () => {
      const config = normalizeArchiveConfig(undefined)
      assert.match(config.backupRoot, /sessions-archived-backup/u)
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

  describe('legacyBackupItem', () => {
    it('旧格式目录 应该 用目录名作 id 与标题并标记 legacy', () => {
      const item = legacyBackupItem('0d21fc8b-56e9-4761-a59f-d972c095d2d8', 1788014172861)
      assert.equal(item.backupId, '0d21fc8b-56e9-4761-a59f-d972c095d2d8')
      assert.equal(item.sessionId, '0d21fc8b-56e9-4761-a59f-d972c095d2d8')
      assert.equal(item.title, '0d21fc8b-56e9-4761-a59f-d972c095d2d8')
      assert.equal(item.legacy, true)
      assert.deepEqual(item.workspaceIds, [])
      assert.match(item.archivedAt, /^\d{4}-\d{2}-\d{2}T/u)
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
