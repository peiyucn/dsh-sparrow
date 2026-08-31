import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolve, sep } from 'node:path'
import { resolveBackupDir, sessionDirectoryFor } from '../lib/host.js'

// 被测函数基于平台原生 path 语义（Windows 盘符路径在 POSIX 上不是绝对路径），
// 测试夹具按当前平台构造——CI 跑 Ubuntu、本机跑 Windows，两边都必须绿。
const win = sep === '\\'
const root = win ? 'C:\\backups' : '/tmp/backups'
const evilId = win ? 'C:\\evil\\outside' : '/evil/outside'
const sessionPath = win ? 'C:\\dsh\\sessions\\session-1\\session.jsonl' : '/dsh/sessions/session-1/session.jsonl'
const sessionDir = win ? 'C:\\dsh\\sessions\\session-1' : '/dsh/sessions/session-1'
const rootLevelSession = win ? 'C:\\session.jsonl' : '/session.jsonl'

describe('archive-session host 纯逻辑', () => {
  describe('resolveBackupDir', () => {
    it('合法备份 id 应该 解析到 backupRoot 下', () => {
      const dir = resolveBackupDir(root, 'abc-123')
      assert.equal(dir, resolve(root, 'abc-123'))
    })

    it('绝对路径风格的备份 id 应该 被消毒后仍落在 backupRoot 下', () => {
      const dir = resolveBackupDir(root, evilId)
      const prefix = resolve(root)
      assert.ok(dir === prefix || dir.startsWith(`${prefix}${sep}`))
      assert.ok(!dir.startsWith(win ? 'C:\\evil' : '/evil'))
    })

    it('空备份 id 应该 落到 unknown 目录', () => {
      const dir = resolveBackupDir(root, '')
      assert.equal(dir, resolve(root, 'unknown'))
    })
  })

  describe('sessionDirectoryFor', () => {
    it('jsonl 单会话目录 应该 返回其父目录', () => {
      const dir = sessionDirectoryFor({ kind: 'jsonl', path: sessionPath })
      assert.equal(dir, sessionDir)
    })

    it('非 jsonl 后端 应该 返回 undefined', () => {
      assert.equal(sessionDirectoryFor({ kind: 'memory', path: 'session-1' }), undefined)
    })

    it('相对路径 应该 返回 undefined', () => {
      assert.equal(sessionDirectoryFor({ kind: 'jsonl', path: `sessions${sep}session-1${sep}session.jsonl` }), undefined)
    })

    it('根目录路径 应该 返回 undefined', () => {
      assert.equal(sessionDirectoryFor({ kind: 'jsonl', path: rootLevelSession }), undefined)
    })
  })
})
