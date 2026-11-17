
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { after, describe, it } from 'node:test'
import { TRASH_SIDECAR } from '../../../lib/host/sessions/archive.js'
import { apply } from '../../../lib/host.js'
import { trashedSessionIds } from '../../../lib/host/sessions/trash.js'



type SessionHeader = { id: string, createdAt: number, version: number }
type Handler = (request: unknown, response: unknown) => Promise<unknown>
type Route = { kind: string, path: string, handler: Handler }
type RequestOptions = { method?: string, headers?: Record<string, string>, body?: string }
type TrashSubagent = { sessionId: string, originalPath: string, parentSessionId?: string, title?: string }
type TrashSpec = {
  trashId: string,
  sessionId: string,
  originalPath: string,
  title?: string,
  subagents?: TrashSubagent[],
}
type ProjectionCache = {
  cachedSnapshot: (meta: unknown, keys: unknown) => unknown,
  coldSnapshot: (meta: unknown, inheritedEventCount: unknown, events: unknown[]) => {
    asOfSeq: number,
    values: Record<string, unknown>,
  },
}
type SessionPayload = {
  sessionId?: string,
  projections?: { kind?: string, asOfSeq?: number, values: Record<string, unknown> },
  parentSessionId?: string,
  origin?: string,
}
type EmittedEvent = { event: string, payload: SessionPayload }
type ParallelEvent = { event: string, payload: { sessionId: string } }
type HarnessOptions = {
  headers: SessionHeader[],
  dirs: Map<string, string>,
  archivedIds: string[],
  pinnedIds?: string[],
  busyIds?: string[],
  titles: Map<string, string>,
  trashRoot: string,
  listError?: boolean,
  projectionCache?: ProjectionCache,
  storageDomain?: { get?: (name: string) => unknown },
}
type Harness = {
  warnings: string[],
  emitted: EmittedEvent[],
  parallelEvents: ParallelEvent[],
  readonly archivedIds: string[],
  readonly pinnedIds: string[],
  registryCalls: { archive: string[], unarchive: string[] },
  readonly route: Route,
  dispose: () => void,
}
type ArchiveError = Error & { activity?: unknown }


const tempRoots: string[] = []

const harnesses: Harness[] = []

after(async () => {
  for (const harness of harnesses) harness.dispose()
  for (const root of tempRoots) await rm(root, { recursive: true, force: true })
})


async function makeLayout() {
  const base = await mkdtemp(join(tmpdir(), 'dsh-archive-route-'))
  tempRoots.push(base)
  const sessions = join(base, 'sessions')
  const trash = join(base, 'trash')
  await mkdir(sessions, { recursive: true })
  return { base, sessions, trash }
}


async function makeSessionDir(sessions, name) {
  const dir = join(sessions, name)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'session.jsonl'), '{"type":"header"}\n', 'utf8')
  return dir
}


const header = (id: string, extra: Record<string, unknown> = {}): SessionHeader => ({ id, createdAt: 1, version: 4, ...extra })


const childHeader = (id, rootId) => header(id, { parentSession: rootId, origin: 'subagent' })


async function makeTrashEntry(layout: { sessions: string, trash: string }, { trashId, sessionId, originalPath, title = sessionId, subagents = [] }: TrashSpec) {
  const trashDir = join(layout.trash, trashId)
  await mkdir(trashDir, { recursive: true })
  await writeFile(join(trashDir, 'session.jsonl'), '{"type":"session"}\n', 'utf8')
  for (const child of subagents) {
    const childDir = join(trashDir, 'subagents', basename(child.originalPath))
    await mkdir(childDir, { recursive: true })
    await writeFile(join(childDir, 'session.jsonl'), '{"type":"session"}\n', 'utf8')
  }
  await writeFile(join(trashDir, TRASH_SIDECAR), JSON.stringify({
    version: 2,
    sessionId,
    title,
    originalPath,
    archivedAt: new Date(0).toISOString(),
    workspaceIds: [],
    ...subagents.length === 0 ? {} : {
      subagents: subagents.map(child => ({
        sessionId: child.sessionId,
        title: child.title ?? child.sessionId,
        originalPath: child.originalPath,
        workspaceIds: [],
        ...child.parentSessionId === undefined ? {} : { parentSessionId: child.parentSessionId },
      })),
    },
  }), 'utf8')
  return trashDir
}


function makeProjectionCache(titles: Map<string, string>) {
  const coldCalls: Array<{ id: string, inheritedEventCount: unknown, eventCount: number }> = []
  return {
    coldCalls,
    cache: {
      cachedSnapshot(meta, keys) {
        void meta
        void keys
        return undefined
      },
      coldSnapshot(meta, inheritedEventCount, events) {
        coldCalls.push({ id: String(meta.id), inheritedEventCount, eventCount: events.length })
        return { asOfSeq: 11, values: { title: titles.get(String(meta.id)) ?? String(meta.id), sessionStats: { turns: 3 } } }
      },
    },
  }
}


async function waitFor(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('等待后台任务超时')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}


async function buildHarness({
  headers, dirs, archivedIds, pinnedIds = [], busyIds = [], titles, trashRoot, listError = false, projectionCache, storageDomain,
}: HarnessOptions) {
  let route: Route | null = null
  const warnings: string[] = []
  const emitted: EmittedEvent[] = []
  const parallelEvents: ParallelEvent[] = []
  const disposers: Array<() => void> = []
  const archived = [...archivedIds]
  const pinned = [...pinnedIds]
  const busy = new Set(busyIds.map(String))
  const registryCalls: { archive: string[], unarchive: string[] } = { archive: [], unarchive: [] }

  const sessionQuery = {

    readTitleSnapshots: async (ids) => ids.map(id => ({
      status: 'fulfilled',
      value: { title: { title: titles.get(String(id)) ?? String(id) } },
    })),
  }
  const headerById = new Map(headers.map(entry => [String(entry.id), entry] as const))


  const nodeTables = new Map()
  const fakeTable = tableName => {
    if (!nodeTables.has(tableName)) nodeTables.set(tableName, new Map())
    const records = nodeTables.get(tableName)
    return {
      get: key => records.get(key),
      entries: () => [...records.entries()][Symbol.iterator](),
      keys: () => [...records.keys()][Symbol.iterator](),
      get size() { return records.size },
      put: async (key, value) => { records.set(key, value) },
      delete: async key => records.delete(key),
      update: async (key, transform) => {
        if (!records.has(key)) throw new Error(`no record '${key}'`)
        const next = transform(records.get(key))
        records.set(key, next)
        return next
      },
    }
  }
  const deskDomain = { name: 'desk_one', table: fakeTable, close: async () => {} }

  const ctx = {
    sessions: { get: () => undefined },
    agents: { get: () => undefined },
    workspaceRegistry: {
      archivedSessionIds: archived,
      pinnedSessionIds: pinned,
      list: () => [],
      get: () => undefined,
      enqueueOperation: async (operation) => operation(),
      archiveSession: async (sessionId) => {
        const id = String(sessionId)
        if (busy.has(id)) {
          const error: ArchiveError = new Error(`cannot archive session '${id}': the session is active (agent)`)
          error.name = 'WorkspaceActiveSessionError'
          error.activity = [{ kind: 'agent' }]
          throw error
        }
        if (!headerById.has(id)) {
          const error = new Error(`cannot archive session '${id}': live sessions and session persistence hold no such session`)
          error.name = 'WorkspaceUnknownSessionError'
          throw error
        }
        registryCalls.archive.push(id)
        if (!archived.some(existing => String(existing) === id)) archived.push(id)
        for (let index = pinned.length - 1; index >= 0; index -= 1) {
          if (String(pinned[index]) === id) pinned.splice(index, 1)
        }
        parallelEvents.push({ event: 'workspace/session-archived', payload: { sessionId: id } })
      },
      unarchiveSession: async (sessionId) => {
        const id = String(sessionId)
        const index = archived.findIndex(existing => String(existing) === id)
        if (index < 0) return
        registryCalls.unarchive.push(id)
        parallelEvents.push({ event: 'workspace/session-unarchiving', payload: { sessionId: id } })
        archived.splice(index, 1)
      },
      requireState: () => ({ archivedSessionIds: archived, pinnedSessionIds: pinned }),
      setState: async (state) => {
        archived.length = 0; archived.push(...state.archivedSessionIds)
        pinned.length = 0; pinned.push(...(state.pinnedSessionIds ?? []))
      },
    },
    sessionPersistence: {

      list: async () => {
        if (listError) throw new Error('disk boom')
        return headers.map(header => {
          const dir = dirs.get(String(header.id))
          return {
            header,
            revision: 1,
            ...(dir === undefined ? {} : { location: { kind: 'jsonl', path: join(dir, 'session.jsonl') } }),
          }
        })
      },


      stat: async (candidate) => {
        const found = headerById.get(String(candidate))
        return found === undefined ? undefined : { header: found, revision: 1 }
      },
      open: async (candidate) => {
        const found = headerById.get(String(candidate))
        if (found === undefined) throw new Error(`not found: ${String(candidate)}`)
        return {
          header: found,
          inheritedEventCount: 0,
          read: async () => ({ eventState: {}, events: [] }),
          close: async () => {},
        }
      },
    },
    sessionQuery,
    storageDomain: {
      open: async () => deskDomain,
      get: (name) => (storageDomain === undefined ? undefined : storageDomain.get?.(name)),
    },
    tools: { register: () => {} },
    webServer: {
      register: (registered) => { route = registered; return () => { route = null } },
    },
    logger: { warn: (message) => { warnings.push(message) }, error: () => {}, info: () => {} },
    effect: (fn) => {
      const dispose = fn()
      const disposer = typeof dispose === 'function' ? dispose : () => {}
      disposers.push(disposer)
      return disposer
    },
    on: () => () => {},
    emit: (event, payload) => { emitted.push({ event, payload }) },

    parallel: async (event, payload) => { parallelEvents.push({ event, payload }); return [] },
    get: (name) => (name === 'sessionQuery' ? sessionQuery : name === 'sessionProjectionCache' ? projectionCache : undefined),
  }

  await apply(ctx, { trashRoot })

  const harness: Harness = {
    warnings,
    emitted,
    parallelEvents,
    get archivedIds() { return [...archived] },
    get pinnedIds() { return [...pinned] },
    registryCalls,
    get route() { return route as Route },
    dispose() { for (const dispose of disposers.splice(0)) { try { dispose() } catch {  } } },
  }
  harnesses.push(harness)
  return harness
}


function makeRequest(url: string, { method = 'GET', headers = { host: '127.0.0.1:3080' }, body }: RequestOptions = {}) {
  return {
    method,
    url,
    headers,
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(body, 'utf8')
    },
  }
}


function makeResponse() {
  let statusCode = 0
  const chunks: string[] = []
  const res = {
    headersSent: false,
    destroyed: false,
    setHeader: () => {},
    end: (chunk?: string) => { chunks.push(chunk ?? '') },
  }
  Object.defineProperty(res, 'statusCode', { set: (value) => { statusCode = value }, get: () => statusCode })
  return { res, status: () => statusCode, text: () => chunks.join('') }
}


async function request(handler: Handler, url: string, options: RequestOptions = {}) {
  const { res, status, text } = makeResponse()
  await handler(makeRequest(url, options), res)
  const raw = text()
  return { statusCode: status(), body: raw === '' ? undefined : JSON.parse(raw) }
}


const post = (handler: Handler, url: string, payload: unknown, extra: RequestOptions = {}) => request(handler, url, {
  method: 'POST',
  body: JSON.stringify(payload),
  ...extra,
})


const HOST_PREFIX = '/api/desk-one'
const PREFIX = '/api/desk-one/sessions'

describe('archive-manage host 路由：真实 handler 行为', () => {
  it('前缀 handler 应该 以 prefix 形态注册在 /api/desk-one', async () => {
    const layout = await makeLayout()
    const h = await buildHarness({
      headers: [header('root-1')],
      dirs: new Map([['root-1', await makeSessionDir(layout.sessions, 'root-1')]]),
      archivedIds: ['root-1'],
      titles: new Map([['root-1', '会话一']]),
      trashRoot: layout.trash,
    })
    assert.equal(h.route.kind, 'prefix')
    assert.equal(h.route.path, HOST_PREFIX)
    assert.equal(typeof h.route.handler, 'function')
  })

  it('⛔ 非受信 Host 请求 应该 403（栅栏挡在一切路由之前）', async () => {
    const layout = await makeLayout()
    const dir = await makeSessionDir(layout.sessions, 'root-1')
    const h = await buildHarness({
      headers: [header('root-1')],
      dirs: new Map([['root-1', dir]]),
      archivedIds: ['root-1'],
      titles: new Map([['root-1', '会话一']]),
      trashRoot: layout.trash,
    })


    const noHost = await post(h.route.handler, `${PREFIX}/delete`,
      { sessionId: 'root-1', confirmTitle: '会话一' }, { headers: {} })
    assert.equal(noHost.statusCode, 403, `缺 Host 头的请求必须被栅栏拒掉，实际 ${noHost.statusCode}`)
    assert.equal(noHost.body.error.code, 'FORBIDDEN')


    const rebound = await request(h.route.handler, `${PREFIX}/trash`, {
      method: 'POST',
      headers: { host: 'evil.example:3080', origin: 'http://evil.example:3080' },
      body: JSON.stringify({ sessionId: 'root-1', confirm: true }),
    })
    assert.equal(rebound.statusCode, 403)
    assert.equal(rebound.body.error.code, 'FORBIDDEN')


    const crossSite = await request(h.route.handler, `${PREFIX}/trash`, {
      method: 'POST',
      headers: { host: '127.0.0.1:3080', origin: 'http://evil.example' },
      body: JSON.stringify({ sessionId: 'root-1', confirm: true }),
    })
    assert.equal(crossSite.statusCode, 403)


    assert.equal(existsSync(dir), true, '被栅栏拒绝的请求不得动过任何文件')
  })

  it('未知路由 应该 404（不是静默 200）', async () => {
    const layout = await makeLayout()
    const h = await buildHarness({
      headers: [], dirs: new Map(), archivedIds: [], titles: new Map(), trashRoot: layout.trash,
    })
    const result = await request(h.route.handler, `${PREFIX}/nope`)
    assert.equal(result.statusCode, 404)
  })

  it('移入回收站缺二次确认 应该 400（不搬任何文件）', async () => {
    const layout = await makeLayout()
    const dir = await makeSessionDir(layout.sessions, 'root-2')
    const h = await buildHarness({
      headers: [header('root-2')],
      dirs: new Map([['root-2', dir]]),
      archivedIds: ['root-2'],
      titles: new Map([['root-2', '会话二']]),
      trashRoot: layout.trash,
    })
    const result = await post(h.route.handler, `${PREFIX}/trash`, { sessionId: 'root-2' })
    assert.equal(result.statusCode, 400)
    assert.equal(result.body.error.code, 'CONFIRMATION_FAILED')
    assert.equal(existsSync(dir), true, '被拒的请求不得动过文件')
  })

  it('⛔ 彻底删除的标题确认不匹配 应该 400（不可逆操作不得放行）', async () => {
    const layout = await makeLayout()
    const dir = await makeSessionDir(layout.sessions, 'root-3')
    const h = await buildHarness({
      headers: [header('root-3')],
      dirs: new Map([['root-3', dir]]),
      archivedIds: ['root-3'],
      titles: new Map([['root-3', '真实标题']]),
      trashRoot: layout.trash,
    })
    const result = await post(h.route.handler, `${PREFIX}/delete`, { sessionId: 'root-3', confirmTitle: '错的标题' })
    assert.equal(result.statusCode, 400)
    assert.equal(result.body.error.code, 'CONFIRMATION_FAILED')
    assert.equal(existsSync(dir), true, '确认失败不得删除任何目录')
  })


  it('⛔ trash：子会话目录是幽灵（ENOENT）应该 跳过搬运并继续，不整单回滚', async () => {
    const layout = await makeLayout()
    const rootDir = await makeSessionDir(layout.sessions, 'p-root')
    const realDir = await makeSessionDir(layout.sessions, 'c-real')
    const ghostDir = join(layout.sessions, 'c-ghost') 

    const h = await buildHarness({
      headers: [header('p-root'), childHeader('c-real', 'p-root'), childHeader('c-ghost', 'p-root')],
      dirs: new Map([['p-root', rootDir], ['c-real', realDir], ['c-ghost', ghostDir]]),
      archivedIds: ['p-root', 'c-real', 'c-ghost'],
      titles: new Map([['p-root', '父会话'], ['c-real', '真子会话'], ['c-ghost', '幽灵子会话']]),
      trashRoot: layout.trash,
    })

    const result = await post(h.route.handler, `${PREFIX}/trash`, { sessionId: 'p-root', confirm: true })


    assert.equal(result.statusCode, 200, `移入回收站应成功，实际 ${result.statusCode}：${JSON.stringify(result.body)}`)
    assert.equal(result.body.ok, true)
    assert.equal(typeof result.body.trashId, 'string')

    const trashDir = join(layout.trash, result.body.trashId)
    assert.equal(existsSync(rootDir), false, '父目录应已搬走')
    assert.equal(existsSync(join(trashDir, 'subagents', 'c-real')), true, '真实子会话应被搬进回收站')
    assert.equal(existsSync(join(trashDir, 'subagents', 'c-ghost')), false, '幽灵子会话没有东西可搬')


    const skipWarn = h.warnings.find(message => message.includes('c-ghost') && message.includes('不在磁盘上'))
    assert.ok(skipWarn !== undefined, `应有幽灵子目录跳过告警，实际告警：${JSON.stringify(h.warnings)}`)


    const sidecar = JSON.parse(await readFile(join(trashDir, TRASH_SIDECAR), 'utf8'))
    assert.deepEqual(sidecar.subagents.map(entry => entry.sessionId), ['c-real'])
    assert.equal(sidecar.sessionId, 'p-root')


    assert.deepEqual([...result.body.subagentIds].sort(), ['c-ghost', 'c-real'])
  })


  it('⛔ delete：子会话目录是幽灵（ENOENT）应该 仍算「已消失」并摘掉归档标记', async () => {
    const layout = await makeLayout()
    const rootDir = await makeSessionDir(layout.sessions, 'd-root')
    const realDir = await makeSessionDir(layout.sessions, 'd-real')
    const ghostDir = join(layout.sessions, 'd-ghost') 

    const h = await buildHarness({
      headers: [header('d-root'), childHeader('d-real', 'd-root'), childHeader('d-ghost', 'd-root')],
      dirs: new Map([['d-root', rootDir], ['d-real', realDir], ['d-ghost', ghostDir]]),
      archivedIds: ['d-root', 'd-real', 'd-ghost'],
      titles: new Map([['d-root', '待删父会话'], ['d-real', '真子会话'], ['d-ghost', '幽灵子会话']]),
      trashRoot: layout.trash,
    })

    const result = await post(h.route.handler, `${PREFIX}/delete`, {
      sessionId: 'd-root',
      confirmTitle: '待删父会话',
    })

    assert.equal(result.statusCode, 200, `彻底删除应成功，实际 ${result.statusCode}：${JSON.stringify(result.body)}`)
    assert.equal(result.body.ok, true)
    assert.equal(result.body.deleted, true)

    assert.deepEqual([...result.body.subagentIds].sort(), ['d-ghost', 'd-real'])
    assert.equal(existsSync(rootDir), false, '根目录应已删除')
    assert.equal(existsSync(realDir), false, '真实子会话应已删除')

    assert.deepEqual([...h.emitted.filter(e => e.event === 'api-session/removed').map(e => String(e.payload))].sort(),
      ['d-ghost', 'd-real', 'd-root'])
  })


  it('⛔ delete：根目录本就不在磁盘上（ENOENT）应该 返回 200 而不是 500（幽灵会话可清掉）', async () => {
    const layout = await makeLayout()
    const ghostRoot = join(layout.sessions, 'gone-root') 

    const h = await buildHarness({
      headers: [header('gone-root')],
      dirs: new Map([['gone-root', ghostRoot]]),
      archivedIds: ['gone-root'],
      titles: new Map([['gone-root', '幽灵会话']]),
      trashRoot: layout.trash,
    })

    const result = await post(h.route.handler, `${PREFIX}/delete`, {
      sessionId: 'gone-root',
      confirmTitle: '幽灵会话',
    })

    assert.equal(result.statusCode, 200, `根目录已消失应视为成功，实际 ${result.statusCode}：${JSON.stringify(result.body)}`)
    assert.equal(result.body.ok, true)
    assert.equal(result.body.deleted, true)
    assert.deepEqual(result.body.subagentIds, [])
    assert.equal(existsSync(ghostRoot), false)

    assert.ok(h.emitted.some(e => e.event === 'api-session/removed' && String(e.payload) === 'gone-root'))
  })


  describe('回收站还原 / 彻底删除：投影行与会话列表同步', () => {
    it('⛔ 还原：缺投影行 应该 重建并补发带 cached 块的 added（父 → 子）', async () => {
      const layout = await makeLayout()
      const rootTarget = join(layout.sessions, 'r1')
      const childTarget = join(layout.sessions, 'c1')
      const { cache, coldCalls } = makeProjectionCache(new Map([['r1', '父会话标题'], ['c1', '子会话标题']]))
      const h = await buildHarness({
        headers: [header('r1'), childHeader('c1', 'r1')],
        dirs: new Map(),
        archivedIds: [],
        titles: new Map(),
        trashRoot: layout.trash,
        projectionCache: cache,
      })
      const trashDir = await makeTrashEntry(layout, {
        trashId: 'entry-restore',
        sessionId: 'r1',
        originalPath: rootTarget,
        title: '父会话标题',
        subagents: [{ sessionId: 'c1', originalPath: childTarget, parentSessionId: 'r1', title: '子会话标题' }],
      })

      const result = await post(h.route.handler, `${PREFIX}/restore`, { trashId: 'entry-restore' })

      assert.equal(result.statusCode, 200, `还原应成功，实际 ${result.statusCode}：${JSON.stringify(result.body)}`)
      assert.equal(result.body.sessionId, 'r1')
      assert.equal(existsSync(join(rootTarget, 'session.jsonl')), true, '父会话日志应移回原处')
      assert.equal(existsSync(join(childTarget, 'session.jsonl')), true, '子会话日志应移回原处')
      assert.equal(existsSync(join(rootTarget, TRASH_SIDECAR)), false, 'sidecar 不得留在会话目录')
      assert.equal(existsSync(trashDir), false, '回收站条目目录应整体移走')


      assert.deepEqual(coldCalls.map(call => call.id), ['r1', 'c1'])
      const added = h.emitted.filter(entry => entry.event === 'api-session/added').map(entry => entry.payload)
      assert.deepEqual(added.map(payload => String(payload.sessionId)), ['r1', 'c1'])
      assert.equal(added[0].projections?.kind, 'cached', 'added 必须带 cached 投影块，客户端列表无需刷新即可显示标题')
      assert.equal(added[0].projections?.values.title, '父会话标题')
      assert.equal(added[1].projections?.values.title, '子会话标题')
      assert.equal(added[1].parentSessionId, 'r1', '子会话 added 必须保留父子关系')
      assert.equal(added[1].origin, 'subagent')
    })

    it('还原：原始位置已有一个空目录 应该 先清掉再还原', async () => {
      const layout = await makeLayout()
      const rootTarget = join(layout.sessions, 'r-empty')
      await mkdir(rootTarget, { recursive: true })
      const h = await buildHarness({
        headers: [header('r-empty')],
        dirs: new Map(),
        archivedIds: [],
        titles: new Map(),
        trashRoot: layout.trash,
      })
      await makeTrashEntry(layout, { trashId: 'entry-empty', sessionId: 'r-empty', originalPath: rootTarget })

      const result = await post(h.route.handler, `${PREFIX}/restore`, { trashId: 'entry-empty' })

      assert.equal(result.statusCode, 200, `还原应成功，实际 ${result.statusCode}：${JSON.stringify(result.body)}`)
      assert.equal(existsSync(join(rootTarget, 'session.jsonl')), true, '会话日志应移回原处')
    })

    it('⛔ 还原：原始位置已有内容 应该 拒绝覆盖且两个目录都保持原样', async () => {
      const layout = await makeLayout()
      const rootTarget = join(layout.sessions, 'r-occupied')
      await mkdir(rootTarget, { recursive: true })
      await writeFile(join(rootTarget, 'keep.txt'), 'existing user data', 'utf8')
      const h = await buildHarness({
        headers: [header('r-occupied')],
        dirs: new Map(),
        archivedIds: [],
        titles: new Map(),
        trashRoot: layout.trash,
      })
      const trashDir = await makeTrashEntry(layout, { trashId: 'entry-occupied', sessionId: 'r-occupied', originalPath: rootTarget })

      const result = await post(h.route.handler, `${PREFIX}/restore`, { trashId: 'entry-occupied' })

      assert.equal(result.statusCode, 400, `应拒绝覆盖，实际 ${result.statusCode}：${JSON.stringify(result.body)}`)
      assert.equal(result.body?.error?.code, 'TARGET_EXISTS')
      assert.equal(existsSync(join(rootTarget, 'keep.txt')), true, '目标位置已有内容不得被删除')
      assert.equal(existsSync(join(trashDir, 'session.jsonl')), true, '回收站条目应保持原样')
    })


    it('彻底删除回收站条目 应该 同时失效父 + 子会话的投影行', async () => {
      const layout = await makeLayout()
      const deleted: string[] = []
      const storageDomain = {
        get: (name) => name === 'session_projcache'
          ? { table: () => ({ delete: async (id) => { deleted.push(String(id)) }, get: () => undefined }) }
          : undefined,
      }
      const h = await buildHarness({
        headers: [],
        dirs: new Map(),
        archivedIds: [],
        titles: new Map(),
        trashRoot: layout.trash,
        storageDomain,
      })
      await makeTrashEntry(layout, {
        trashId: 'entry-delete',
        sessionId: 'r1',
        originalPath: join(layout.sessions, 'r1'),
        subagents: [{ sessionId: 'c1', originalPath: join(layout.sessions, 'c1'), parentSessionId: 'r1' }],
      })

      const result = await post(h.route.handler, `${PREFIX}/trash-delete`, { trashId: 'entry-delete', confirm: true })

      assert.equal(result.statusCode, 200, `彻底删除应成功，实际 ${result.statusCode}：${JSON.stringify(result.body)}`)
      assert.equal(existsSync(join(layout.trash, 'entry-delete')), false)

      assert.deepEqual([...deleted].sort(), ['c1', 'r1'])
    })

    it('trashedSessionIds 应该 收集父 + 子会话 id，并跳过无 sidecar 的旧格式目录', async () => {
      const layout = await makeLayout()
      await makeTrashEntry(layout, {
        trashId: 'ids-1',
        sessionId: 'r1',
        originalPath: join(layout.sessions, 'r1'),
        subagents: [{ sessionId: 'c1', originalPath: join(layout.sessions, 'c1'), parentSessionId: 'r1' }],
      })
      await makeTrashEntry(layout, { trashId: 'ids-2', sessionId: 'r2', originalPath: join(layout.sessions, 'r2') })

      await mkdir(join(layout.trash, 'legacy-entry'), { recursive: true })

      const ids = await trashedSessionIds(layout.trash)
      assert.deepEqual([...ids].sort(), ['c1', 'r1', 'r2'])
    })

    it('全部还原 应该 先返回响应，再后台回填并补发 added（不阻塞请求）', async () => {
      const layout = await makeLayout()
      const { cache } = makeProjectionCache(new Map([['a1', '标题 A'], ['a2', '标题 B']]))
      const h = await buildHarness({
        headers: [header('a1'), header('a2')],
        dirs: new Map(),
        archivedIds: [],
        titles: new Map(),
        trashRoot: layout.trash,
        projectionCache: cache,
      })
      await makeTrashEntry(layout, { trashId: 'all-1', sessionId: 'a1', originalPath: join(layout.sessions, 'a1') })
      await makeTrashEntry(layout, { trashId: 'all-2', sessionId: 'a2', originalPath: join(layout.sessions, 'a2') })

      const result = await post(h.route.handler, `${PREFIX}/trash-restore-all`, { confirm: true })

      assert.equal(result.statusCode, 200)
      assert.deepEqual([...result.body.restored].sort(), ['a1', 'a2'])

      await waitFor(() => h.emitted.filter(entry => entry.event === 'api-session/added').length >= 2)
      const added = h.emitted.filter(entry => entry.event === 'api-session/added')
      assert.deepEqual(added.map(entry => String(entry.payload.sessionId)).sort(), ['a1', 'a2'])
      for (const entry of added) {
        assert.equal(entry.payload.projections?.kind, 'cached')
      }
    })
  })


  describe('请求体语义（readJsonBody 抛错而非返回错误对象）', () => {

    async function routeHarness() {
      const layout = await makeLayout()
      const h = await buildHarness({
        headers: [], dirs: new Map(), archivedIds: [], titles: new Map(), trashRoot: layout.trash,
      })
      return h
    }

    it('⛔ 超过 64KB 的请求体 应该 400 且 message 指向请求体上限', async () => {
      const h = await routeHarness()
      const body = JSON.stringify({ sessionId: 'root', confirm: true, pad: 'x'.repeat(70 * 1024) })
      const result = await request(h.route.handler, `${PREFIX}/trash`, { method: 'POST', body })
      assert.equal(result.statusCode, 400)
      assert.equal(result.body.error.code, 'BAD_BODY')
      assert.match(result.body.error.message, /请求体/u)
      assert.match(result.body.error.message, /字节上限/u)
      assert.doesNotMatch(result.body.error.message, /sessionId 必须/u)
    })

    it('⛔ 非法 JSON 应该 400 且 message 指向请求体', async () => {
      const h = await routeHarness()
      const result = await request(h.route.handler, `${PREFIX}/trash`, { method: 'POST', body: '{"sessionId":' })
      assert.equal(result.statusCode, 400)
      assert.equal(result.body.error.code, 'BAD_BODY')
      assert.match(result.body.error.message, /请求体不是合法 JSON/u)
    })

    it('⛔ 数组 body 应该 400 且 message 指向「必须是 JSON 对象」', async () => {
      const h = await routeHarness()
      const result = await request(h.route.handler, `${PREFIX}/trash`, { method: 'POST', body: '[]' })
      assert.equal(result.statusCode, 400)
      assert.equal(result.body.error.code, 'BAD_BODY')
      assert.match(result.body.error.message, /请求体必须是 JSON 对象/u)
    })

    it('未预期异常 应该 500 且 logger 收到一条 warn（非 ArchiveError 路径）', async () => {
      const layout = await makeLayout()
      const h = await buildHarness({
        headers: [], dirs: new Map(), archivedIds: [], titles: new Map(), trashRoot: layout.trash, listError: true,
      })
      const result = await request(h.route.handler, `${PREFIX}/list`)
      assert.equal(result.statusCode, 500)
      assert.equal(result.body.error.code, 'STORAGE_ERROR')
      assert.equal(
        h.warnings.filter(message => message.includes('未预期的路由错误')).length,
        1,
        `500 路径应记一条 logger.warn，实际：${JSON.stringify(h.warnings)}`,
      )
    })
  })
})


describe('归档 / 取消归档：委托官方 registry 正路', () => {
  it('归档 应该 调用官方 archiveSession（活动门 / 摘 pin / 后续事件由官方负责）', async () => {
    const layout = await makeLayout()
    const h = await buildHarness({
      headers: [header('root-a')], dirs: new Map(), archivedIds: [], pinnedIds: ['root-a'], titles: new Map(), trashRoot: layout.trash,
    })
    const result = await post(h.route.handler, `${PREFIX}/archive`, { sessionId: 'root-a' })
    assert.equal(result.statusCode, 200)
    assert.deepEqual(h.registryCalls.archive, ['root-a'], '必须委托官方 archiveSession，而不是自己写归档集')
    assert.deepEqual(h.archivedIds, ['root-a'])
    assert.deepEqual(h.pinnedIds, [], 'pin 摘除由官方写入负责')
    assert.deepEqual(h.parallelEvents, [
      { event: 'workspace/session-archived', payload: { sessionId: 'root-a' } },
    ], '归档后续动作由官方派发（worktree 清理等监听方据此处理）')
  })

  it('归档有进行中活动的会话 应该 映射成 409 SESSION_ACTIVE（不再绕过官方活动门）', async () => {
    const layout = await makeLayout()
    const h = await buildHarness({
      headers: [header('busy-a')],
      dirs: new Map(),
      archivedIds: [],
      busyIds: ['busy-a'],
      titles: new Map(),
      trashRoot: layout.trash,
    })
    const result = await post(h.route.handler, `${PREFIX}/archive`, { sessionId: 'busy-a' })
    assert.equal(result.statusCode, 409)
    assert.equal(result.body.error.code, 'SESSION_ACTIVE')
    assert.match(result.body.error.message, /停止/u)
    assert.deepEqual(h.archivedIds, [], '被官方拒绝时归档集不得变化')
  })

  it('归档不存在的会话 应该 映射成 404 UNKNOWN_SESSION（官方会话存在性检查）', async () => {
    const layout = await makeLayout()
    const h = await buildHarness({
      headers: [], dirs: new Map(), archivedIds: [], titles: new Map(), trashRoot: layout.trash,
    })
    const result = await post(h.route.handler, `${PREFIX}/archive`, { sessionId: 'ghost-a' })
    assert.equal(result.statusCode, 404)
    assert.equal(result.body.error.code, 'UNKNOWN_SESSION')
  })

  it('取消归档 应该 调用官方 unarchiveSession，并保留 api-session/added 通知', async () => {
    const layout = await makeLayout()
    const h = await buildHarness({
      headers: [header('root-b')], dirs: new Map(), archivedIds: ['root-b'], titles: new Map(), trashRoot: layout.trash,
    })
    const result = await post(h.route.handler, `${PREFIX}/unarchive`, { sessionId: 'root-b' })
    assert.equal(result.statusCode, 200)
    assert.deepEqual(h.registryCalls.unarchive, ['root-b'], '必须委托官方 unarchiveSession')
    assert.deepEqual(h.archivedIds, [])
    assert.deepEqual(h.parallelEvents, [
      { event: 'workspace/session-unarchiving', payload: { sessionId: 'root-b' } },
    ])
    assert.ok(h.emitted.some(entry => entry.event === 'api-session/added'), '恢复后仍需重发 added，避免列表要刷新')
  })

  it('取消归档一个本来未归档的会话 应该 是 no-op（官方幂等语义）', async () => {
    const layout = await makeLayout()
    const h = await buildHarness({
      headers: [header('root-c')], dirs: new Map(), archivedIds: [], titles: new Map(), trashRoot: layout.trash,
    })
    const result = await post(h.route.handler, `${PREFIX}/unarchive`, { sessionId: 'root-c' })
    assert.equal(result.statusCode, 200)
    assert.deepEqual(h.parallelEvents, [])
    assert.deepEqual(h.registryCalls.unarchive, [])
  })
})
