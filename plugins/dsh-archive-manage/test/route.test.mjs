import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { TRASH_SIDECAR } from '../lib/archive.js'
import { apply } from '../lib/host.js'

/**
 * 归档路由的**真行为**用例：走真实的 `apply` → `webServer.register` → handler，
 * 断言 HTTP 状态码与响应体。本插件的 handler 含**不可逆**的目录移动 / 删除
 * （`POST /trash` 把会话目录移进回收站、`POST /delete` 直接 rm 掉），
 * 在此之前整个 handler（src/host.ts 的 webServer handler）**零覆盖** ——
 * 而「栅栏/宽恕分支写在源码里但没被调用」是零价值，故这里全部调真实 handler。
 *
 * 重点覆盖三条 **ENOENT 宽恕**分支（陈旧 header 缓存 / 手工删过的「幽灵」子目录）：
 * ① trash：子会话目录不在磁盘上 → 跳过搬运并继续，不让整单回滚（src/host.ts:1323-1326）
 * ② delete：子会话目录已消失 → force:true 只吞 ENOENT，仍算「已消失」并摘归档标记（:1409）
 * ③ delete：**根**目录本就不在磁盘上 → force:true 同样吞掉，返回 200 而不是 500（:1400）
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
 * 用最小 mock ctx 跑真实 `apply`，拿回注册的 prefix handler。
 *
 * @param options.headers - `sessionPersistence.list()` 返回的 header 列表。
 * @param options.dirs - 会话 id → 磁盘目录（`locate` 的 path 落在该目录下）。
 * @param options.archivedIds - 归档集内容（含根会话即视为「已归档」）。
 * @param options.titles - 会话 id → 标题（`readTitleSnapshots` 的返回值）。
 * @param options.trashRoot - 回收站根目录。
 */
async function buildHarness({ headers, dirs, archivedIds, titles, trashRoot }) {
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
      list: async () => headers,
      locate: (candidate) => {
        const dir = dirs.get(String(candidate.id))
        return dir === undefined ? undefined : { kind: 'jsonl', path: join(dir, 'session.jsonl') }
      },
    },
    sessionQuery,
    storageDomain: { get: () => undefined },
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
    get: (name) => (name === 'sessionQuery' ? sessionQuery : undefined),
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

/** 最小 req（handler 用到 headers / method / url，POST 还要能 async-iterate 出 body）。 */
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

/** 走一次真实 handler，回状态码与解析后的响应体。 */
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
   * ① trash 跳过幽灵子目录（src/host.ts:1323-1326）。
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
   * ② delete 跳过幽灵子目录（src/host.ts:1409）。
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
   * ③ delete 根目录 force:true（src/host.ts:1400）。
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
})
