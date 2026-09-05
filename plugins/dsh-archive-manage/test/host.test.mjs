import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolve, sep } from 'node:path'
import { createHeaderFactsStore } from '../lib/archive.js'
import { addedSummaryFor, alignChildArchives, assertRegistryMutationApi, assertSessionLocationApi, FOLDED_LABEL_CACHE_MAX_ENTRIES, mutateArchivedSet, resolveTrashDir, sessionDirectoryFor, storedHeaders, subagentLabel } from '../lib/host.js'

// 被测函数基于平台原生 path 语义（Windows 盘符路径在 POSIX 上不是绝对路径），
// 测试夹具按当前平台构造——CI 跑 Ubuntu、本机跑 Windows，两边都必须绿。
const win = sep === '\\'
const root = win ? 'C:\\backups' : '/tmp/backups'
const evilId = win ? 'C:\\evil\\outside' : '/evil/outside'
const sessionPath = win ? 'C:\\dsh\\sessions\\session-1\\session.jsonl' : '/dsh/sessions/session-1/session.jsonl'
const sessionDir = win ? 'C:\\dsh\\sessions\\session-1' : '/dsh/sessions/session-1'
const rootLevelSession = win ? 'C:\\session.jsonl' : '/session.jsonl'

describe('archive-manage host 纯逻辑', () => {
  describe('resolveTrashDir', () => {
    it('合法回收站 id 应该 解析到 trashRoot 下', () => {
      const dir = resolveTrashDir(root, 'abc-123')
      assert.equal(dir, resolve(root, 'abc-123'))
    })

    it('绝对路径风格的回收站 id 应该 被消毒后仍落在 trashRoot 下', () => {
      const dir = resolveTrashDir(root, evilId)
      const prefix = resolve(root)
      assert.ok(dir === prefix || dir.startsWith(`${prefix}${sep}`))
      assert.ok(!dir.startsWith(win ? 'C:\\evil' : '/evil'))
    })

    it('空回收站 id 应该 落到 unknown 目录', () => {
      const dir = resolveTrashDir(root, '')
      assert.equal(dir, resolve(root, 'unknown'))
    })
  })

  describe('sessionDirectoryFor', () => {
    it('jsonl 单会话目录 应该 返回其父目录', () => {
      const dir = sessionDirectoryFor({ kind: 'jsonl', path: sessionPath })
      assert.equal(dir, sessionDir)
    })

    it('rc.1 zstd 压缩产物（session.jsonl.zstd）应该 返回其父目录', () => {
      const dir = sessionDirectoryFor({
        kind: 'jsonl',
        path: win ? 'C:\\dsh\\sessions\\session-1\\session.jsonl.zstd' : '/dsh/sessions/session-1/session.jsonl.zstd',
      })
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

  describe('assertRegistryMutationApi', () => {
    it('缺 enqueueOperation 应该 抛含方法名的明确错误', () => {
      assert.throws(
        () => assertRegistryMutationApi({ requireState: () => ({}), setState: async () => {} }),
        /enqueueOperation/,
      )
    })

    it('缺 requireState 应该 抛含方法名的明确错误', () => {
      assert.throws(
        () => assertRegistryMutationApi({ enqueueOperation: async fn => fn(), setState: async () => {} }),
        /requireState/,
      )
    })

    it('缺 setState 应该 抛含方法名的明确错误', () => {
      assert.throws(
        () => assertRegistryMutationApi({ enqueueOperation: async fn => fn(), requireState: () => ({}) }),
        /setState/,
      )
    })

    it('三个方法齐全 应该 返回可用 surface', () => {
      const surface = assertRegistryMutationApi({
        enqueueOperation: async fn => fn(),
        requireState: () => ({ archivedSessionIds: [] }),
        setState: async () => {},
      })
      assert.equal(typeof surface.enqueueOperation, 'function')
      assert.equal(typeof surface.requireState, 'function')
      assert.equal(typeof surface.setState, 'function')
    })
  })

  describe('assertSessionLocationApi', () => {
    it('缺 locate 应该 抛含 locate 的明确错误', () => {
      assert.throws(() => assertSessionLocationApi({}), /locate/)
    })

    it('locate 非函数 应该 抛错', () => {
      assert.throws(() => assertSessionLocationApi({ locate: 'x' }), /locate/)
    })

    it('locate 存在 应该 不抛', () => {
      assert.doesNotThrow(() => assertSessionLocationApi({ locate: () => ({ kind: 'jsonl', path: '/x/session.jsonl' }) }))
    })
  })

  describe('addedSummaryFor', () => {
    it('普通 header 应该 只含必填字段', () => {
      const summary = addedSummaryFor({ id: 'a', createdAt: 42, isSeeded: false }, true)
      assert.deepEqual(summary, { sessionId: 'a', updatedAt: 42, running: false, blank: true })
    })

    it('subagent header 应该 透出 parent 与 origin 与 cwd', () => {
      const summary = addedSummaryFor({ id: 'b', createdAt: 1, isSeeded: false, parentSession: 'p', origin: 'subagent', cwd: '/w' }, false)
      assert.equal(summary.parentSessionId, 'p')
      assert.equal(summary.origin, 'subagent')
      assert.equal(summary.cwd, '/w')
      assert.equal(summary.blank, false)
    })
  })

  describe('storedHeaders', () => {
    const ctxWithList = (list) => ({ sessionPersistence: { list } })

    it('master 快照形状 应该 映射为 header', async () => {
      const ctx = ctxWithList(async () => [
        { header: { id: 'a', createdAt: 1, isSeeded: false }, revision: 'r1' },
        { header: { id: 'b', createdAt: 2, isSeeded: false }, revision: 'r2' },
      ])
      const headers = await storedHeaders(ctx)
      assert.deepEqual(headers.map(h => String(h.id)), ['a', 'b'])
    })

    it('旧 header 形状 应该 原样通过', async () => {
      const ctx = ctxWithList(async () => [{ id: 'c', createdAt: 3, isSeeded: false }])
      const headers = await storedHeaders(ctx)
      assert.deepEqual(headers.map(h => String(h.id)), ['c'])
    })
  })

  describe('mutateArchivedSet', () => {
    function fakeRegistry(initialIds) {
      const calls = []
      let state = { archivedSessionIds: [...initialIds], initialized: true, workspaceIds: [] }
      const surface = {
        enqueueOperation: async (op) => { calls.push('enqueue'); return op() },
        requireState: () => state,
        setState: async (next) => { calls.push('set'); state = next },
      }
      return { surface, calls, get: () => state }
    }

    it('update 移除 id 应该 经串行链 setState 新集合', async () => {
      const { surface, calls, get } = fakeRegistry(['a', 'b'])
      await mutateArchivedSet(surface, ids => ids.filter(id => id !== 'a'))
      assert.deepEqual(calls, ['enqueue', 'set'])
      assert.deepEqual(get().archivedSessionIds, ['b'])
    })

    it('update 返回同一引用 应该 不触发 setState（幂等无写）', async () => {
      const { surface, calls, get } = fakeRegistry(['a'])
      await mutateArchivedSet(surface, ids => ids)
      assert.deepEqual(calls, ['enqueue'])
      assert.deepEqual(get().archivedSessionIds, ['a'])
    })

    it('update 返回内容一致的新数组 应该 不触发 setState（零写入）', async () => {
      const { surface, calls, get } = fakeRegistry(['a', 'b'])
      await mutateArchivedSet(surface, ids => ids.filter(id => id !== 'x'))
      assert.deepEqual(calls, ['enqueue'])
      assert.deepEqual(get().archivedSessionIds, ['a', 'b'])
    })

    it('追加已存在的 id 应该 不重复（幂等）', async () => {
      const { surface, get } = fakeRegistry(['a'])
      await mutateArchivedSet(surface, ids => ids.includes('a') ? ids : [...ids, 'a'])
      assert.deepEqual(get().archivedSessionIds, ['a'])
    })
  })

  describe('alignChildArchives（spec 09 审计）', () => {
    const headerOf = (id, extra = {}) => ({ id, createdAt: 1, isSeeded: false, ...extra })
    const alignCtx = (archivedIds) => ({
      workspaceRegistry: { archivedSessionIds: archivedIds },
      logger: { info: () => {}, warn: () => {} },
    })
    const alignSurface = () => {
      let state = { archivedSessionIds: ['p'] }
      return {
        surface: {
          enqueueOperation: async (op) => op(),
          requireState: () => state,
          setState: async (next) => { state = next },
        },
        get: () => state,
      }
    }

    it('headers 应该 经 header 事实缓存取（暖缓存不重复扫盘）', async () => {
      let loads = 0
      const store = createHeaderFactsStore(async () => {
        loads += 1
        return { headers: [], sizes: new Map() }
      }, 30_000, () => 0)
      const { surface } = alignSurface()
      await alignChildArchives(alignCtx([]), surface, store)
      await alignChildArchives(alignCtx([]), surface, store)
      assert.equal(loads, 1)
    })

    it('父已归档而子未归档 应该 把子补进归档集', async () => {
      const store = createHeaderFactsStore(async () => ({
        headers: [headerOf('p'), headerOf('c', { parentSession: 'p', origin: 'subagent' })],
        sizes: new Map(),
      }), 30_000, () => 0)
      const { surface, get } = alignSurface()
      await alignChildArchives(alignCtx(['p']), surface, store)
      assert.deepEqual(get().archivedSessionIds.map(String).sort(), ['c', 'p'])
    })
  })

  describe('subagentLabel 三档读链', () => {
    const labelHeader = (id, extra = {}) => ({ id, createdAt: 1, isSeeded: false, origin: 'subagent', ...extra })
    const labelCtx = ({ live, cacheRow, cacheThrows = false, observe, observeThrows = false }) => ({
      sessions: { get: () => live },
      get: (name) => {
        if (name === 'sessionProjections') {
          return live === undefined ? undefined : { snapshot: () => ({ values: { subagent: { label: 'live-label' } } }) }
        }
        if (name === 'sessionProjectionCache') {
          return { cachedSnapshot: cacheThrows ? () => { throw new Error('cache boom') } : () => cacheRow }
        }
        if (name === 'sessionQuery') {
          return { observeSession: observeThrows ? async () => { throw new Error('fold boom') } : observe }
        }
        return undefined
      },
      logger: { warn: () => {} },
    })

    it('live 子会话 应该 走注册表快照', async () => {
      const ctx = labelCtx({ live: { live: true } })
      assert.equal(await subagentLabel(ctx, labelHeader('live-1')), 'live-label')
    })

    it('冷会话 + 缓存命中 应该 用缓存行标签', async () => {
      const ctx = labelCtx({ cacheRow: { values: { subagent: { label: 'cached-label' } } } })
      assert.equal(await subagentLabel(ctx, labelHeader('cold-cache-1')), 'cached-label')
    })

    it('缓存落空 + 未种子 应该 从日志折叠并释放租约', async () => {
      let disposed = 0
      const ctx = labelCtx({
        cacheRow: undefined,
        observe: async () => ({
          header: { createdAt: 1 },
          projections: { values: { subagent: { label: 'folded-label' } } },
          dispose: () => { disposed += 1 },
        }),
      })
      assert.equal(await subagentLabel(ctx, labelHeader('cold-fold-1')), 'folded-label')
      assert.equal(disposed, 1)
    })

    it('rc.1 Disposable 租约（仅 Symbol.dispose）应该 正确释放', async () => {
      let disposed = 0
      const ctx = labelCtx({
        cacheRow: undefined,
        observe: async () => ({
          header: { createdAt: 1 },
          projections: { values: { subagent: { label: 'rc1-label' } } },
          [Symbol.dispose]: () => { disposed += 1 },
        }),
      })
      assert.equal(await subagentLabel(ctx, labelHeader('cold-fold-rc1')), 'rc1-label')
      assert.equal(disposed, 1)
    })

    it('缓存读取抛错 应该 继续走日志折叠档', async () => {
      const ctx = labelCtx({
        cacheThrows: true,
        observe: async () => ({
          header: { createdAt: 1 },
          projections: { values: { subagent: { label: 'folded-after-cache-boom' } } },
          dispose: () => {},
        }),
      })
      assert.equal(await subagentLabel(ctx, labelHeader('cold-fold-2')), 'folded-after-cache-boom')
    })

    it('种子冷会话 应该 不走日志折叠档（OOM 场景门）', async () => {
      let observed = 0
      const ctx = labelCtx({
        cacheRow: undefined,
        observe: async () => { observed += 1; return undefined },
      })
      assert.equal(await subagentLabel(ctx, labelHeader('seeded-1', { isSeeded: true })), undefined)
      assert.equal(observed, 0)
    })

    it('日志折叠抛错 应该 回退 undefined', async () => {
      const ctx = labelCtx({ cacheRow: undefined, observeThrows: true })
      assert.equal(await subagentLabel(ctx, labelHeader('cold-fold-3')), undefined)
    })

    it('折叠成功结果 应该 按 sessionId 记忆（二次调用不再折叠）', async () => {
      let observed = 0
      const ctx = labelCtx({
        cacheRow: undefined,
        observe: async () => {
          observed += 1
          return { header: { createdAt: 1 }, projections: { values: { subagent: { label: 'memo-label' } } }, dispose: () => {} }
        },
      })
      assert.equal(await subagentLabel(ctx, labelHeader('cold-fold-4')), 'memo-label')
      assert.equal(await subagentLabel(ctx, labelHeader('cold-fold-4')), 'memo-label')
      assert.equal(observed, 1)
    })

    it('折叠记忆超过 LRU 上限 应该 淘汰最旧条目（有界不无限累积）', async () => {
      const observed = new Map()
      const ctx = {
        sessions: { get: () => undefined },
        get: (name) => {
          if (name === 'sessionQuery') {
            return {
              observeSession: async (id) => {
                const key = String(id)
                observed.set(key, (observed.get(key) ?? 0) + 1)
                return { header: { createdAt: 1 }, projections: { values: { subagent: { label: `label-${key}` } } }, dispose: () => {} }
              },
            }
          }
          return undefined
        },
        logger: { warn: () => {} },
      }
      for (let i = 0; i <= FOLDED_LABEL_CACHE_MAX_ENTRIES; i++) {
        assert.equal(await subagentLabel(ctx, labelHeader(`evict-${i}`)), `label-evict-${i}`)
      }
      // 最旧的 evict-0 已被 LRU 淘汰：再查一次会重新折叠，而不是无限记忆。
      assert.equal(await subagentLabel(ctx, labelHeader('evict-0')), 'label-evict-0')
      assert.equal(observed.get('evict-0'), 2)
    })

    it('观察生命周期与 header 不一致 应该 拒绝并释放租约', async () => {
      let disposed = 0
      const ctx = labelCtx({
        cacheRow: undefined,
        observe: async () => ({
          header: { createdAt: 99 },
          projections: { values: { subagent: { label: 'stale-label' } } },
          dispose: () => { disposed += 1 },
        }),
      })
      assert.equal(await subagentLabel(ctx, labelHeader('cold-fold-5')), undefined)
      assert.equal(disposed, 1)
    })
  })
})