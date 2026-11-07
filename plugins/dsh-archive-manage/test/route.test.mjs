// @ts-check
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { after, describe, it } from 'node:test'
import { TRASH_SIDECAR } from '../lib/archive.js'
import { apply } from '../lib/host.js'
import { trashProjectionIds } from '../lib/host/trash.js'

/**
 * 归档路由的**真行为**用例：走真实的 `apply` → `webServer.register` → handler，
 * 断言 HTTP 状态码与响应体。本插件的 handler 含**不可逆**的目录移动 / 删除
 * （`POST /trash` 把会话目录移进回收站、`POST /delete` 直接 rm 掉），
 * 在此之前整个 handler（src/host/routes.ts 的 webServer handler）**零覆盖** ——
 * 而「栅栏/宽恕分支写在源码里但没被调用」是零价值，故这里全部调真实 handler。
 *
 * 重点覆盖三条 **ENOENT 宽恕**分支（陈旧 header 缓存 / 手工删过的「幽灵」子目录）：
 * ① trash：子会话目录不在磁盘上 → 跳过搬运并继续，不让整单回滚（host/session-files.ts 的 moveSessionToTrash）
 * ② delete：子会话目录已消失 → force:true 只吞 ENOENT，仍算「已消失」并摘归档标记（deleteSessionTree）
 * ③ delete：**根**目录本就不在磁盘上 → force:true 同样吞掉，返回 200 而不是 500（deleteSessionTree）
 *
 * 所有文件操作都在 `mkdtemp` 出来的临时目录里，绝不碰真实 ~/.dsh 数据。
 */

/** 本文件创建的全部临时根目录（suite 结束时清理）。 */
const tempRoots = []
/** 本文件 apply 过的 harness（suite 结束时跑 disposer，清掉启动清扫定时器等句柄）。 */
const harnesses = []

after(async () => {
  for (const harness of harnesses) harness.dispose()
  for (const root of tempRoots) await rm(root, { recursive: true, force: true })
})

/** 一个临时根目录：`sessions/` 放会话目录，`trash/` 当回收站。 */
async function makeLayout() {
  const base = await mkdtemp(join(tmpdir(), 'dsh-archive-route-'))
  tempRoots.push(base)
  const sessions = join(base, 'sessions')
  const trash = join(base, 'trash')
  await mkdir(sessions, { recursive: true })
  return { base, sessions, trash }
}

/** 造一个会话目录（含一个 session.jsonl 占位，模拟真实持久化布局）。 */
async function makeSessionDir(sessions, name) {
  const dir = join(sessions, name)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'session.jsonl'), '{"type":"header"}\n', 'utf8')
  return dir
}

/**
 * 会话 header（宿主真值格式门认 `version`；rc.2 的 SESSION_FORMAT_VERSION 为 4）。
 * @param id - 会话 id。
 * @param extra - 追加字段（子会话用 parentSession + origin:'subagent'）。
 */
const header = (id, extra = {}) => ({ id, createdAt: 1, version: 4, ...extra })

/** 子会话 header（挂在 root 下）。 */
const childHeader = (id, rootId) => header(id, { parentSession: rootId, origin: 'subagent' })

/**
 * 造一个回收站条目：条目目录 + 可还原的 sidecar（父 + 可选子会话），模拟真实
 * `.sessions-trash/<trashId>/` 布局。子会话目录名必须等于 `basename(originalPath)`
 * （还原按它 rename 回原处）。
 *
 * @param {{ sessions: string, trash: string }} layout
 * @param {{
 *   trashId: string,
 *   sessionId: string,
 *   originalPath: string,
 *   title?: string,
 *   subagents?: Array<{ sessionId: string, originalPath: string, parentSessionId?: string, title?: string }>,
 * }} spec
 */
async function makeTrashEntry(layout, { trashId, sessionId, originalPath, title = sessionId, subagents = [] }) {
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

/**
 * 官方投影缓存桩：`cachedSnapshot` 恒 miss（复现事故——还原的会话行已被旧版启动清扫删掉），
 * `coldSnapshot` 是 3 形参的写回面，返回带 title 的投影块。
 *
 * @param {Map<string, string>} titles - 会话 id → 标题
 */
function makeProjectionCache(titles) {
  const coldCalls = []
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

/** 等后台任务（响应后触发的回填）完成：predicate 成立即返回，超时抛错。 */
async function waitFor(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('等待后台任务超时')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

/**
 * 用最小 mock ctx 跑真实 `apply`，拿回注册的 prefix handler。
 *
 * options：`headers` = `sessionPersistence.list()` 返回的 header 列表；`dirs` = 会话 id →
 * 磁盘目录（`locate` 的 path 落在该目录下）；`archivedIds` = 归档集内容（含根会话即视为
 * 「已归档」）；`titles` = 会话 id → 标题（`readTitleSnapshots` 的返回值）；
 * `trashRoot` = 回收站根目录；`projectionCache` = 官方投影缓存服务桩（还原回填用）；
 * `storageDomain` = 官方存储域桩（投影行失效用）。
 *
 * @param {{
 *   headers: any[],
 *   dirs: Map<string, string>,
 *   archivedIds: string[],
 *   titles: Map<string, string>,
 *   trashRoot: string,
 *   listError?: boolean,
 *   projectionCache?: any,
 *   storageDomain?: any,
 * }} options
 */
async function buildHarness({
  headers, dirs, archivedIds, titles, trashRoot, listError = false, projectionCache, storageDomain,
}) {
  let route = null
  const warnings = []
  const emitted = []
  const disposers = []
  const archived = [...archivedIds]

  const sessionQuery = {
    // titlesFor 的第二档：官方批量标题读取；这里返回「全部 fulfilled」的桩。
    readTitleSnapshots: async (ids) => ids.map(id => ({
      status: 'fulfilled',
      value: { title: { title: titles.get(String(id)) ?? String(id) } },
    })),
  }
  const headerById = new Map(headers.map(entry => [String(entry.id), entry]))

  const ctx = {
    sessions: { get: () => undefined },
    agents: { get: () => undefined },
    workspaceRegistry: {
      archivedSessionIds: archived,
      list: () => [],
      get: () => undefined,
      enqueueOperation: async (operation) => operation(),
      requireState: () => ({ archivedSessionIds: archived }),
      setState: async (state) => { archived.length = 0; archived.push(...state.archivedSessionIds) },
    },
    sessionPersistence: {
      list: async () => {
        if (listError) throw new Error('disk boom')
        return headers
      },
      locate: (candidate) => {
        const dir = dirs.get(String(candidate.id))
        return dir === undefined ? undefined : { kind: 'jsonl', path: join(dir, 'session.jsonl') }
      },
      // 投影行回填的冷读面：stat 拿 header，open 返回最小读句柄（空日志即可，
      // 回填只关心「是否读了日志」与 coldSnapshot 的入参形状）。
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
    storageDomain: storageDomain ?? { get: () => undefined },
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
    get: (name) => (name === 'sessionQuery' ? sessionQuery : name === 'sessionProjectionCache' ? projectionCache : undefined),
  }

  await apply(ctx, { trashRoot })

  const harness = {
    warnings,
    emitted,
    get route() { return route },
    dispose() { for (const dispose of disposers.splice(0)) { try { dispose() } catch { /* best-effort */ } } },
  }
  harnesses.push(harness)
  return harness
}

/**
 * 最小 req（handler 用到 headers / method / url，POST 还要能 async-iterate 出 body）。
 *
 * @param {string} url
 * @param {{ method?: string, headers?: Record<string, string>, body?: string }} [options]
 */
function makeRequest(url, { method = 'GET', headers = { host: '127.0.0.1:3080' }, body } = {}) {
  return {
    method,
    url,
    headers,
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(body, 'utf8')
    },
  }
}

/** 最小 res：记录 statusCode 与 end() 收到的响应体。 */
function makeResponse() {
  let statusCode = 0
  const chunks = []
  const res = {
    headersSent: false,
    destroyed: false,
    setHeader: () => {},
    end: (chunk) => { chunks.push(chunk ?? '') },
  }
  Object.defineProperty(res, 'statusCode', { set: (value) => { statusCode = value }, get: () => statusCode })
  return { res, status: () => statusCode, text: () => chunks.join('') }
}

/**
 * 走一次真实 handler，回状态码与解析后的响应体。
 *
 * @param {any} handler
 * @param {string} url
 * @param {{ method?: string, headers?: Record<string, string>, body?: string }} [options]
 */
async function request(handler, url, options = {}) {
  const { res, status, text } = makeResponse()
  await handler(makeRequest(url, options), res)
  const raw = text()
  return { statusCode: status(), body: raw === '' ? undefined : JSON.parse(raw) }
}

/**
 * 带 JSON body 的 POST。
 * @param extra - 覆盖项（`headers` 用于精确控制信任栅栏的输入）。
 */
const post = (handler, url, payload, extra = {}) => request(handler, url, {
  method: 'POST',
  body: JSON.stringify(payload),
  ...extra,
})

/** 请求体必须是非空 JSON 对象：这里给 bodyObject 一个已 parse 的对象。 */
const PREFIX = '/api/archive-manage'

describe('archive-manage host 路由：真实 handler 行为', () => {
  it('前缀 handler 应该 以 prefix 形态注册在 /api/archive-manage', async () => {
    const layout = await makeLayout()
    const h = await buildHarness({
      headers: [header('root-1')],
      dirs: new Map([['root-1', await makeSessionDir(layout.sessions, 'root-1')]]),
      archivedIds: ['root-1'],
      titles: new Map([['root-1', '会话一']]),
      trashRoot: layout.trash,
    })
    assert.equal(h.route.kind, 'prefix')
    assert.equal(h.route.path, PREFIX)
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

    // 缺 Host 头（浏览器图片式读取 / 被剥标记）：必须 403。
    const noHost = await post(h.route.handler, `${PREFIX}/delete`,
      { sessionId: 'root-1', confirmTitle: '会话一' }, { headers: {} })
    assert.equal(noHost.statusCode, 403, `缺 Host 头的请求必须被栅栏拒掉，实际 ${noHost.statusCode}`)
    assert.equal(noHost.body.error.code, 'FORBIDDEN')

    // DNS rebinding：Host 与 Origin 同为攻击者域名（自洽但非本机）→ 403。
    const rebound = await request(h.route.handler, `${PREFIX}/trash`, {
      method: 'POST',
      headers: { host: 'evil.example:3080', origin: 'http://evil.example:3080' },
      body: JSON.stringify({ sessionId: 'root-1', confirm: true }),
    })
    assert.equal(rebound.statusCode, 403)
    assert.equal(rebound.body.error.code, 'FORBIDDEN')

    // 跨站 Origin（Host 是回环也拒）→ 403。
    const crossSite = await request(h.route.handler, `${PREFIX}/trash`, {
      method: 'POST',
      headers: { host: '127.0.0.1:3080', origin: 'http://evil.example' },
      body: JSON.stringify({ sessionId: 'root-1', confirm: true }),
    })
    assert.equal(crossSite.statusCode, 403)

    // 栅栏在最前：连「缺确认」的 400 / 真删除都不该走到，文件必须原封不动。
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

  /**
   * ① trash 跳过幽灵子目录（host/session-files.ts 的 moveSessionToTrash）。
   *
   * 场景：父目录在磁盘上，一个子会话目录真实存在、另一个已不在磁盘上
   * （陈旧 header 缓存 / 用户手工删过）。`rename` 对幽灵目录抛 ENOENT ——
   * 必须**跳过并继续**，不能整单回滚把用户永久卡在「这个树移不进回收站」。
   */
  it('⛔ trash：子会话目录是幽灵（ENOENT）应该 跳过搬运并继续，不整单回滚', async () => {
    const layout = await makeLayout()
    const rootDir = await makeSessionDir(layout.sessions, 'p-root')
    const realDir = await makeSessionDir(layout.sessions, 'c-real')
    const ghostDir = join(layout.sessions, 'c-ghost') // 有意不创建

    const h = await buildHarness({
      headers: [header('p-root'), childHeader('c-real', 'p-root'), childHeader('c-ghost', 'p-root')],
      dirs: new Map([['p-root', rootDir], ['c-real', realDir], ['c-ghost', ghostDir]]),
      archivedIds: ['p-root', 'c-real', 'c-ghost'],
      titles: new Map([['p-root', '父会话'], ['c-real', '真子会话'], ['c-ghost', '幽灵子会话']]),
      trashRoot: layout.trash,
    })

    const result = await post(h.route.handler, `${PREFIX}/trash`, { sessionId: 'p-root', confirm: true })

    // 整单成功（不是 500 / 不是回滚）——这正是宽恕分支的意义。
    assert.equal(result.statusCode, 200, `移入回收站应成功，实际 ${result.statusCode}：${JSON.stringify(result.body)}`)
    assert.equal(result.body.ok, true)
    assert.equal(typeof result.body.trashId, 'string')

    const trashDir = join(layout.trash, result.body.trashId)
    assert.equal(existsSync(rootDir), false, '父目录应已搬走')
    assert.equal(existsSync(join(trashDir, 'subagents', 'c-real')), true, '真实子会话应被搬进回收站')
    assert.equal(existsSync(join(trashDir, 'subagents', 'c-ghost')), false, '幽灵子会话没有东西可搬')

    // 幽灵被跳过时必须有面向开发者的告警（不是静默）。
    const skipWarn = h.warnings.find(message => message.includes('c-ghost') && message.includes('不在磁盘上'))
    assert.ok(skipWarn !== undefined, `应有幽灵子目录跳过告警，实际告警：${JSON.stringify(h.warnings)}`)

    // sidecar 只记**真的搬走**的子会话（幽灵不得让还原造出空目录）。
    const sidecar = JSON.parse(await readFile(join(trashDir, TRASH_SIDECAR), 'utf8'))
    assert.deepEqual(sidecar.subagents.map(entry => entry.sessionId), ['c-real'])
    assert.equal(sidecar.sessionId, 'p-root')

    // 响应里的 subagentIds 是「整棵子树」（归档集清理口径），与 sidecar 的「已搬走」不同。
    assert.deepEqual([...result.body.subagentIds].sort(), ['c-ghost', 'c-real'])
  })

  /**
   * ② delete 跳过幽灵子目录（host/session-files.ts 的 deleteSessionTree）。
   *
   * `rm(child.dir, { recursive: true, force: true })` 的 `force` **只吞 ENOENT**：
   * 目录本就不在磁盘上同样算「已消失」，必须进 `deletedSubagentIds` ——
   * 否则它会以「失败、仍在磁盘上」被保留归档标记，成为再也删不掉的孤儿根。
   */
  it('⛔ delete：子会话目录是幽灵（ENOENT）应该 仍算「已消失」并摘掉归档标记', async () => {
    const layout = await makeLayout()
    const rootDir = await makeSessionDir(layout.sessions, 'd-root')
    const realDir = await makeSessionDir(layout.sessions, 'd-real')
    const ghostDir = join(layout.sessions, 'd-ghost') // 有意不创建

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
    // 幽灵也进 deleted 列表 —— 这正是 force:true 吞 ENOENT 的可观察结果。
    assert.deepEqual([...result.body.subagentIds].sort(), ['d-ghost', 'd-real'])
    assert.equal(existsSync(rootDir), false, '根目录应已删除')
    assert.equal(existsSync(realDir), false, '真实子会话应已删除')
    // 归档集应把整棵子树摘干净（否则幽灵 id 会永久留在归档区）。
    assert.deepEqual([...h.emitted.filter(e => e.event === 'api-session/removed').map(e => String(e.payload))].sort(),
      ['d-ghost', 'd-real', 'd-root'])
  })

  /**
   * ③ delete 根目录 force:true（host/session-files.ts 的 deleteSessionTree）。
   *
   * 根会话目录本就不在磁盘上（陈旧 header 缓存 / 已被别的操作搬走）：
   * `force: true` 必须吞掉 ENOENT 并返回 200 —— 否则幽灵会话会永久留在归档面板里，
   * 面板里再也清不掉（用户点一次 500、再点还是 500）。
   */
  it('⛔ delete：根目录本就不在磁盘上（ENOENT）应该 返回 200 而不是 500（幽灵会话可清掉）', async () => {
    const layout = await makeLayout()
    const ghostRoot = join(layout.sessions, 'gone-root') // 有意不创建

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
    // 归档集必须被摘掉（否则归档面板里永远清不掉的幽灵条目）。
    assert.ok(h.emitted.some(e => e.event === 'api-session/removed' && String(e.payload) === 'gone-root'))
  })

  /**
   * 回收站还原 / 彻底删除的投影行收尾（2026-11-08 事故）：
   * 还原后的会话在回收站期间被旧版启动清扫删掉了投影行，输入框 @ 退化成裸 session id、
   * 任务板 @ 退化成项目目录名（官方列表在标题缺失时回退 cwd basename），两边表现还不一样。
   * 修复后：还原读回冷日志经官方 coldSnapshot 重建行，并补发带 cached 投影块的 added。
   */
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

      // 缺行 → 父 + 子都要读回冷日志回填（顺序 = 根在前）。
      assert.deepEqual(coldCalls.map(call => call.id), ['r1', 'c1'])
      const added = h.emitted.filter(entry => entry.event === 'api-session/added').map(entry => entry.payload)
      assert.deepEqual(added.map(payload => String(payload.sessionId)), ['r1', 'c1'])
      assert.equal(added[0].projections?.kind, 'cached', 'added 必须带 cached 投影块，客户端列表无需刷新即可显示标题')
      assert.equal(added[0].projections?.values.title, '父会话标题')
      assert.equal(added[1].projections?.values.title, '子会话标题')
      assert.equal(added[1].parentSessionId, 'r1', '子会话 added 必须保留父子关系')
      assert.equal(added[1].origin, 'subagent')
    })

    it('彻底删除回收站条目 应该 同时失效父 + 子会话的投影行', async () => {
      const layout = await makeLayout()
      const deleted = []
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
      // 回收站期间投影行被清扫保留，彻底删除必须由删除路由收尾，否则留下永久读不到的僵尸体。
      assert.deepEqual([...deleted].sort(), ['c1', 'r1'])
    })

    it('trashProjectionIds 应该 收集父 + 子会话 id，并跳过无 sidecar 的旧格式目录', async () => {
      const layout = await makeLayout()
      await makeTrashEntry(layout, {
        trashId: 'ids-1',
        sessionId: 'r1',
        originalPath: join(layout.sessions, 'r1'),
        subagents: [{ sessionId: 'c1', originalPath: join(layout.sessions, 'c1'), parentSessionId: 'r1' }],
      })
      await makeTrashEntry(layout, { trashId: 'ids-2', sessionId: 'r2', originalPath: join(layout.sessions, 'r2') })
      // 旧格式（无 sidecar）不可还原：它的会话 id 无从得知，不属于「要保留投影行」的集合。
      await mkdir(join(layout.trash, 'legacy-entry'), { recursive: true })

      const ids = await trashProjectionIds(layout.trash)
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
      // 回填在响应之后启动：等后台完成（桩全在内存，微任务级即可）。
      await waitFor(() => h.emitted.filter(entry => entry.event === 'api-session/added').length >= 2)
      const added = h.emitted.filter(entry => entry.event === 'api-session/added')
      assert.deepEqual(added.map(entry => String(entry.payload.sessionId)).sort(), ['a1', 'a2'])
      for (const entry of added) {
        assert.equal(entry.payload.projections?.kind, 'cached')
      }
    })
  })

  /**
   * 请求体错误必须是 **400 + 指向请求体** 的错误，而不是被当成合法 body 后误报
   * 「sessionId 必须非空」——那会把「请求太大 / JSON 坏了」诊断成「你没传 id」。
   */
  describe('请求体语义（readJsonBody 抛错而非返回错误对象）', () => {
    /** 一个普通 harness（只需路由已注册；请求体在进业务前就被拒）。 */
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
      assert.equal(result.body.error.code, 'IO_ERROR')
      assert.equal(
        h.warnings.filter(message => message.includes('未预期的路由错误')).length,
        1,
        `500 路径应记一条 logger.warn，实际：${JSON.stringify(h.warnings)}`,
      )
    })
  })
})
