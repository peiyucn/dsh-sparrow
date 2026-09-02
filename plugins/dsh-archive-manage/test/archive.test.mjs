import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isDeleteConfirmationSufficient, legacyTrashItem, maskHomePath, normalizeArchiveConfig,
  parseTrashSidecar, parseBlankProjection, sanitizeSegment, straySessionIds,
} from '../lib/archive.js'

describe('archive-manage 纯逻辑', () => {
  describe('normalizeArchiveConfig', () => {
    it('空配置 应该 提供默认回收站目录', () => {
      const config = normalizeArchiveConfig(undefined)
      assert.match(config.trashRoot, /\.sessions-trash/u)
    })

    it('trashRoot 配置 应该 优先采用', () => {
      const config = normalizeArchiveConfig({ trashRoot: 'D:/trash' })
      assert.equal(config.trashRoot, 'D:/trash')
    })

    it('trashRoot 空串 应该 抛明确错误', () => {
      assert.throws(() => normalizeArchiveConfig({ trashRoot: '  ' }), /trashRoot/u)
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
        maskHomePath('C:\\Users\\DJ028191\\.dsh\\.sessions-trash', 'C:\\Users\\DJ028191'),
        '~\\.dsh\\.sessions-trash',
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

    it('v6 行形状（顶层 identity + rows）blank 为真 应该 判定空白', () => {
      const row = { identity: { createdAt: 1 }, rows: { sessionListMetadata: { ver: 1, seq: 2, val: { blank: true } } } }
      assert.deepEqual(parseBlankProjection(row), { blank: true })
    })

    it('v6 行形状 turns 为 0 应该 判定空白', () => {
      const row = { identity: {}, rows: { sessionStats: { ver: 1, seq: 0, val: { turns: 0 } } } }
      assert.deepEqual(parseBlankProjection(row), { blank: true })
    })

    it('v6 行形状有轮次且无 blank 应该 返回 undefined', () => {
      const row = { identity: {}, rows: { sessionStats: { ver: 1, seq: 3, val: { turns: 3 } } } }
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