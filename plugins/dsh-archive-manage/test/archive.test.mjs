import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  archiveAlignmentForChildren, buildSessionTree, collectSubtreeIds, isDeleteConfirmationSufficient,
  legacyTrashItem, livingChildIds, maskHomePath, normalizeArchiveConfig, parseTrashSidecar, parseBlankProjection,
  parseSessionFacts, sanitizeSegment, straySessionIds, trashItemView,
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

  describe('buildSessionTree', () => {
    const h = (id, createdAt, extra = {}) => ({ id, createdAt, ...extra })

    it('父与两个子 应该 挂成一层树，子按 createdAt 升序', () => {
      const tree = buildSessionTree([
        h('p', 100),
        h('c2', 40, { parentSession: 'p', origin: 'subagent' }),
        h('c1', 10, { parentSession: 'p', origin: 'subagent' }),
      ])
      assert.equal(tree.length, 1)
      assert.equal(tree[0].header.id, 'p')
      assert.deepEqual(tree[0].children.map(c => c.header.id), ['c1', 'c2'])
    })

    it('孤儿子会话（父不在清单）应该 成为根节点', () => {
      const tree = buildSessionTree([
        h('p', 100),
        h('orphan', 50, { parentSession: 'gone', origin: 'subagent' }),
      ])
      assert.deepEqual(tree.map(t => t.header.id).sort(), ['orphan', 'p'])
    })

    it('多层嵌套 应该 递归展开', () => {
      const tree = buildSessionTree([
        h('p', 100),
        h('c', 50, { parentSession: 'p', origin: 'subagent' }),
        h('gc', 10, { parentSession: 'c', origin: 'subagent' }),
      ])
      assert.equal(tree[0].children[0].children[0].header.id, 'gc')
    })

    it('根节点 应该 按 createdAt 降序', () => {
      const tree = buildSessionTree([h('old', 1), h('new', 9)])
      assert.deepEqual(tree.map(t => t.header.id), ['new', 'old'])
    })
  })

  describe('archiveAlignmentForChildren', () => {
    const h = (id, extra = {}) => ({ id, createdAt: 1, ...extra })
    const child = (id, parent) => h(id, { parentSession: parent, origin: 'subagent' })

    it('父已归档而子未归档 应该 子进 add', () => {
      const r = archiveAlignmentForChildren([h('p'), child('c', 'p')], ['p'])
      assert.deepEqual(r, { add: ['c'], remove: [] })
    })

    it('父未归档而子已归档 应该 子进 remove', () => {
      const r = archiveAlignmentForChildren([h('p'), child('c', 'p')], ['c'])
      assert.deepEqual(r, { add: [], remove: ['c'] })
    })

    it('父子状态一致 应该 全空', () => {
      const r = archiveAlignmentForChildren([h('p'), child('c', 'p')], ['p', 'c'])
      assert.deepEqual(r, { add: [], remove: [] })
    })

    it('孤儿与顶层会话 应该 不参与', () => {
      const r = archiveAlignmentForChildren([h('top'), child('orphan', 'gone')], ['orphan'])
      assert.deepEqual(r, { add: [], remove: [] })
    })
  })

  describe('livingChildIds', () => {
    const h = (id, extra = {}) => ({ id, createdAt: 1, ...extra })

    it('有父的子会话 应该 入选', () => {
      const ids = livingChildIds([h('p'), h('c', { parentSession: 'p', origin: 'subagent' })])
      assert.deepEqual([...ids], ['c'])
    })

    it('孤儿子会话与顶层会话 应该 不入选', () => {
      const ids = livingChildIds([h('top'), h('orphan', { parentSession: 'gone', origin: 'subagent' })])
      assert.deepEqual([...ids], [])
    })
  })

  describe('collectSubtreeIds', () => {
    const h = (id, extra = {}) => ({ id, createdAt: 1, ...extra })

    it('父与多层子孙 应该 全部收集且根在前', () => {
      const ids = collectSubtreeIds([
        h('p'), h('c', { parentSession: 'p', origin: 'subagent' }),
        h('gc', { parentSession: 'c', origin: 'subagent' }),
        h('other', { parentSession: 'x', origin: 'subagent' }),
      ], 'p')
      assert.deepEqual(ids, ['p', 'c', 'gc'])
    })

    it('无子会话 应该 只有根自身', () => {
      assert.deepEqual(collectSubtreeIds([h('p')], 'p'), ['p'])
    })
  })

  describe('parseSessionFacts', () => {
    it('v6 形状 应该 解析轮数/token/最后活跃时间', () => {
      const row = {
        identity: {},
        rows: {
          sessionStats: { ver: 1, seq: 3, val: { turns: 12, decodeTokens: 1200000 } },
          sessionListMetadata: { ver: 1, seq: 3, val: { lastPromptAt: 1788 } },
        },
      }
      assert.deepEqual(parseSessionFacts(row), { turns: 12, decodeTokens: 1200000, lastPromptAt: 1788 })
    })

    it('v5 形状（record 包装）应该 解析', () => {
      const row = { record: { rows: { sessionStats: { val: { turns: 3 } } } } }
      assert.deepEqual(parseSessionFacts(row), { turns: 3 })
    })

    it('无有效字段 应该 返回 undefined', () => {
      assert.equal(parseSessionFacts({ rows: { sessionStats: { val: {} } } }), undefined)
      assert.equal(parseSessionFacts(null), undefined)
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

  describe('trashItemView', () => {
    it('version 2 sidecar 应该 透出子会话展示清单（父子联动数据）', () => {
      const view = trashItemView('trash-1', {
        version: 2,
        sessionId: 'p',
        title: 'parent',
        originalPath: 'C:/tmp/p',
        archivedAt: '2026-09-04T10:00:00.000Z',
        workspaceIds: ['w'],
        subagents: [
          { sessionId: 'c1', title: 'child1', originalPath: 'C:/tmp/c1', workspaceIds: ['w'] },
          { sessionId: 'c2', title: 'child2', originalPath: 'C:/tmp/c2', workspaceIds: [] },
        ],
      })
      assert.equal(view.trashId, 'trash-1')
      assert.equal(view.sessionId, 'p')
      assert.equal(view.title, 'parent')
      assert.equal(view.legacy, false)
      assert.deepEqual(view.subagents, [{ sessionId: 'c1', title: 'child1' }, { sessionId: 'c2', title: 'child2' }])
    })

    it('version 1 sidecar 无子会话 应该 返回空数组（不破坏列表渲染）', () => {
      const view = trashItemView('trash-2', {
        version: 1,
        sessionId: 'p',
        title: 'parent',
        originalPath: 'C:/tmp/p',
        archivedAt: '2026-09-04T10:00:00.000Z',
        workspaceIds: [],
      })
      assert.deepEqual(view.subagents, [])
    })
  })
})