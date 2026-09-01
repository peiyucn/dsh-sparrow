import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  decideTrashMigration, isDeleteConfirmationSufficient, legacyTrashItem, maskHomePath, normalizeArchiveConfig,
  parseTrashSidecar, parseBlankProjection, sanitizeSegment, straySessionIds,
} from '../lib/archive.js'

describe('archive-manage 纯逻辑', () => {
  describe('normalizeArchiveConfig', () => {
    it('空配置 应该 提供默认回收站目录', () => {
      const config = normalizeArchiveConfig(undefined)
      assert.match(config.trashRoot, /\.sessions-recycle-bin/u)
    })

    it('trashRoot 配置 应该 优先采用', () => {
      const config = normalizeArchiveConfig({ trashRoot: 'D:/trash' })
      assert.equal(config.trashRoot, 'D:/trash')
    })

    it('仅旧键 backupRoot 应该 回退读取', () => {
      const config = normalizeArchiveConfig({ backupRoot: 'D:/old' })
      assert.equal(config.trashRoot, 'D:/old')
    })

    it('trashRoot 与 backupRoot 同给 应该 优先 trashRoot', () => {
      const config = normalizeArchiveConfig({ trashRoot: 'D:/new', backupRoot: 'D:/old' })
      assert.equal(config.trashRoot, 'D:/new')
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

  describe('maskHomePath', () => {
    it('Windows home 前缀 应该 掩码为 ~', () => {
      assert.equal(
        maskHomePath('C:\\Users\\DJ028191\\.dsh\\.sessions-recycle-bin', 'C:\\Users\\DJ028191'),
        '~\\.dsh\\.sessions-recycle-bin',
      )
    })

    it('Windows 大小写不同 应该 也能掩码', () => {
      assert.equal(
        maskHomePath('c:\\users\\dj028191\\.dsh\\x', 'C:\\Users\\DJ028191'),
        '~\\.dsh\\x',
      )
    })

    it('POSIX home 前缀 应该 掩码为 ~', () => {
      assert.equal(maskHomePath('/home/alice/.dsh/trash', '/home/alice'), '~/.dsh/trash')
    })

    it('路径等于 home 应该 掩码为 ~', () => {
      assert.equal(maskHomePath('/home/alice', '/home/alice'), '~')
    })

    it('不在 home 下 应该 原样返回', () => {
      assert.equal(maskHomePath('/opt/data/trash', '/home/alice'), '/opt/data/trash')
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

  describe('legacyTrashItem', () => {
    it('旧格式目录 应该 用目录名作 id 与标题并标记 legacy', () => {
      const item = legacyTrashItem('0d21fc8b-56e9-4761-a59f-d972c095d2d8', 1788014172861)
      assert.equal(item.trashId, '0d21fc8b-56e9-4761-a59f-d972c095d2d8')
      assert.equal(item.sessionId, '0d21fc8b-56e9-4761-a59f-d972c095d2d8')
      assert.equal(item.title, '0d21fc8b-56e9-4761-a59f-d972c095d2d8')
      assert.equal(item.legacy, true)
      assert.deepEqual(item.workspaceIds, [])
      assert.match(item.archivedAt, /^\d{4}-\d{2}-\d{2}T/u)
    })
  })

  describe('decideTrashMigration', () => {
    const legacy = 'C:/Users/u/.dsh/sessions-archived-backup'
    const target = 'C:/Users/u/.dsh/.sessions-recycle-bin'

    it('配置指向旧默认目录且旧在、新缺 应该 决定迁移', () => {
      const decision = decideTrashMigration(legacy, legacy, target, true, false)
      assert.equal(decision.kind, 'migrate')
      if (decision.kind === 'migrate') {
        assert.equal(decision.legacyDir, legacy)
        assert.equal(decision.targetDir, target)
      }
    })

    it('配置指向旧默认目录但旧缺 应该 直接用新目录不迁移', () => {
      const decision = decideTrashMigration(legacy, legacy, target, false, false)
      assert.equal(decision.kind, 'none')
      if (decision.kind === 'none') assert.equal(decision.trashRoot, target)
    })

    it('旧新双在 应该 用新目录并提示旧目录残留', () => {
      const decision = decideTrashMigration(legacy, legacy, target, true, true)
      assert.equal(decision.kind, 'none')
      if (decision.kind === 'none') {
        assert.equal(decision.trashRoot, target)
        assert.ok(decision.warning !== undefined)
      }
    })

    it('自定义目录且旧默认目录仍在 应该 不迁移并提示', () => {
      const decision = decideTrashMigration('D:/custom', legacy, target, true, false)
      assert.equal(decision.kind, 'none')
      if (decision.kind === 'none') {
        assert.equal(decision.trashRoot, 'D:/custom')
        assert.ok(decision.warning !== undefined)
      }
    })

    it('自定义目录且旧默认目录不在 应该 无提示', () => {
      const decision = decideTrashMigration('D:/custom', legacy, target, false, false)
      assert.equal(decision.kind, 'none')
      if (decision.kind === 'none') {
        assert.equal(decision.trashRoot, 'D:/custom')
        assert.equal(decision.warning, undefined)
      }
    })

    it('大小写不同的同一路径 应该 视为旧默认位置', () => {
      const decision = decideTrashMigration('C:/Users/U/.dsh/SESSIONS-ARCHIVED-BACKUP', legacy, target, true, false)
      assert.equal(decision.kind, 'migrate')
    })
  })

  describe('straySessionIds', () => {
    it('持久化有且未归档且未挂工作区 应该 判定游离', () => {
      assert.deepEqual(straySessionIds(['a', 'b'], [], []), ['a', 'b'])
    })

    it('已归档 应该 排除', () => {
      assert.deepEqual(straySessionIds(['a', 'b'], ['a'], []), ['b'])
    })

    it('挂工作区 应该 排除', () => {
      assert.deepEqual(straySessionIds(['a', 'b'], [], ['b']), ['a'])
    })

    it('归档与挂工作区叠加 应该 都排除且保持输入顺序', () => {
      assert.deepEqual(straySessionIds(['a', 'b', 'c', 'd'], ['b'], ['c']), ['a', 'd'])
    })

    it('清单为空 应该 返回空数组', () => {
      assert.deepEqual(straySessionIds([], ['x'], ['y']), [])
    })
  })

  describe('parseBlankProjection', () => {
    it('blank 标记为真 应该 判定空白', () => {
      const row = { version: 4, record: { identity: {}, rows: { sessionListMetadata: { val: { blank: true, lastPromptAt: null } } } } }
      assert.deepEqual(parseBlankProjection(row), { blank: true })
    })

    it('仅 turns 为 0 应该 判定空白', () => {
      const row = { record: { rows: { sessionStats: { val: { turns: 0 } } } } }
      assert.deepEqual(parseBlankProjection(row), { blank: true })
    })

    it('有轮次且无 blank 标记 应该 返回 undefined', () => {
      const row = { record: { rows: { sessionStats: { val: { turns: 3 } } } } }
      assert.equal(parseBlankProjection(row), undefined)
    })

    it('行缺失 rows 应该 返回 undefined', () => {
      assert.equal(parseBlankProjection({ record: { identity: {} } }), undefined)
    })

    it('非对象输入 应该 返回 undefined', () => {
      assert.equal(parseBlankProjection(null), undefined)
      assert.equal(parseBlankProjection('x'), undefined)
    })
  })

  describe('parseTrashSidecar', () => {
    it('合法 sidecar 应该 返回结构化信息', () => {
      const sidecar = parseTrashSidecar({
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
      assert.equal(parseTrashSidecar({ version: 1, sessionId: 's', archivedAt: 'now', workspaceIds: [] }), undefined)
    })

    it('version 2 带合法 subagents 应该 解析出子会话清单', () => {
      const sidecar = parseTrashSidecar({
        version: 2,
        sessionId: 'p',
        title: 'parent',
        originalPath: 'C:/tmp/p',
        archivedAt: 'now',
        workspaceIds: ['w'],
        subagents: [
          { sessionId: 'c1', title: 'child1', originalPath: 'C:/tmp/c1', workspaceIds: ['w'] },
          { sessionId: 'c2', originalPath: 'C:/tmp/c2', workspaceIds: [] },
        ],
      })
      assert.equal(sidecar?.version, 2)
      assert.equal(sidecar?.subagents?.length, 2)
      assert.equal(sidecar?.subagents?.[1].title, 'c2')
      assert.deepEqual(sidecar?.subagents?.[0].workspaceIds, ['w'])
    })

    it('version 2 subagents 含非法条目 应该 返回 undefined', () => {
      const sidecar = parseTrashSidecar({
        version: 2,
        sessionId: 'p',
        originalPath: 'C:/tmp/p',
        archivedAt: 'now',
        workspaceIds: [],
        subagents: [{ sessionId: 'c1', originalPath: 'C:/tmp/c1', workspaceIds: ['w'] }, { title: 'bad' }],
      })
      assert.equal(sidecar, undefined)
    })

    it('version 1 无 subagents 应该 正常解析', () => {
      const sidecar = parseTrashSidecar({
        version: 1,
        sessionId: 'p',
        originalPath: 'C:/tmp/p',
        archivedAt: 'now',
        workspaceIds: [],
      })
      assert.equal(sidecar?.version, 1)
      assert.equal(sidecar?.subagents, undefined)
    })
  })
})
