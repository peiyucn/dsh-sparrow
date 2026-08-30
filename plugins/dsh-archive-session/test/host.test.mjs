import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolve } from 'node:path'
import { resolveBackupDir, sessionDirectoryFor } from '../lib/host.js'

describe('archive-session host 纯逻辑', () => {
  describe('resolveBackupDir', () => {
    it('合法备份 id 应该 解析到 backupRoot 下', () => {
      const dir = resolveBackupDir('C:\\backups', 'abc-123')
      assert.equal(dir, resolve('C:\\backups', 'abc-123'))
    })

    it('绝对路径风格的备份 id 应该 被消毒后仍落在 backupRoot 下', () => {
      const dir = resolveBackupDir('C:\\backups', 'C:\\evil\\outside')
      assert.ok(dir.startsWith(`${resolve('C:\\backups')}\\`))
      assert.ok(!dir.startsWith('C:\\evil'))
    })

    it('空备份 id 应该 落到 unknown 目录', () => {
      const dir = resolveBackupDir('C:\\backups', '')
      assert.equal(dir, resolve('C:\\backups', 'unknown'))
    })
  })

  describe('sessionDirectoryFor', () => {
    it('jsonl 单会话目录 应该 返回其父目录', () => {
      const dir = sessionDirectoryFor({ kind: 'jsonl', path: 'C:\\dsh\\sessions\\session-1\\session.jsonl' })
      assert.equal(dir, 'C:\\dsh\\sessions\\session-1')
    })

    it('非 jsonl 后端 应该 返回 undefined', () => {
      assert.equal(sessionDirectoryFor({ kind: 'memory', path: 'session-1' }), undefined)
    })

    it('相对路径 应该 返回 undefined', () => {
      assert.equal(sessionDirectoryFor({ kind: 'jsonl', path: 'sessions\\session-1\\session.jsonl' }), undefined)
    })

    it('根目录路径 应该 返回 undefined', () => {
      assert.equal(sessionDirectoryFor({ kind: 'jsonl', path: 'C:\\session.jsonl' }), undefined)
    })
  })
})
