/** dsh-archive-manage host half：归档会话管理 REST 路由。 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdir, readdir, readFile, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { SessionId, SessionSeq, type SessionHeader } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { SessionTitleObservationResult } from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-storage-domain'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import type { Workspace, WorkspaceDomainState } from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-workspace'
import {
  TRASH_SIDECAR, archiveAlignmentForChildren, archivedIdsToRemove, buildSessionTree, collectSubtreeIds, createBudgetSignal,
  createHeaderFactsStore, createLruCache, isDeleteConfirmationSufficient, isSafeSessionDirName, labelFromSubagentIdentity,
  legacyTrashItem, livingChildIds, maskHomePath, normalizeArchiveConfig, parseBlankProjection, parseSessionFacts,
  parseTrashSidecar, runBounded, sanitizeSegment, straySessionIds, subagentDescendantIds, trashItemView,
  type ArchiveConfig, type ArchiveSidecar, type ArchiveSubagentSidecar, type HeaderFactsStore, type SessionFacts,
  type SessionTreeHeader, type SessionTreeNode, type SubagentIdentityValue,
} from './archive.js'
import { assertHostCompatible, unsupportedStoredFormatReason } from './compat.js'

export const name = 'dsh-archive-manage'
export const inject = ['webServer', 'sessions', 'agents', 'workspaceRegistry', 'sessionPersistence', 'sessionQuery', 'storageDomain']

export type { ArchiveConfig }

const PREFIX = '/api/archive-manage'
const MAX_BODY_BYTES = 64 * 1024
/** header 事实缓存 TTL（spec 09）：写穿失效之外的兜底，防没有事件的边界路径留陈旧成员表。 */
const HEADER_CACHE_TTL_MS = 30_000
/** 冷会话整份日志折叠的有界并发（spec 09）：同一时间至多 N 个冷会话在做折叠。
 *  现由子会话标签折叠使用；标题折叠整批交给官方 readTitleSnapshots（其内部并发同为 4）。 */
const TITLE_FOLD_CONCURRENCY = 4
/** 标题折叠兜底的整体预算（spec 09）：超时后未完成的折叠按失败处理、回退会话 id。 */
const TITLE_FOLD_BUDGET_MS = 8_000

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * 官方 session-controller 公开事件（@mode emit，见 dsh-api-session-controller types.ts）：
     * 会话离开宿主时客户端会话列表据此即时移除条目。移入回收站/删除成功后会话目录已移走，
     * 补发此事件让侧边栏「未分组」等列表立即同步（2026-08-30 修复残留条目）。
     */
    'api-session/removed'(sessionId: SessionId): void
    /** 官方公开事件：会话回到列表（载荷形状对齐官方 SessionSummary 的插件可用子集，见 dsh-api-session-controller types.ts）。 */
    'api-session/added'(summary: { sessionId: SessionId; updatedAt: number; running: boolean; blank: boolean; parentSessionId?: SessionId; origin?: 'subagent'; cwd?: string }): void
  }
}

type ArchiveErrorCode =
  | 'BAD_BODY'
  | 'NOT_ARCHIVED'
  | 'UNKNOWN_SESSION'
  | 'UNKNOWN_TRASH'
  | 'SESSION_LIVE'
  | 'BACKEND_UNSUPPORTED'
  | 'CONFIRMATION_FAILED'
  | 'TARGET_EXISTS'
  | 'IO_ERROR'

class ArchiveError extends Error {
  constructor(readonly code: ArchiveErrorCode, message: string, readonly status = 400) {
    super(message)
    this.name = 'ArchiveError'
  }
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.headersSent) return
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('content-length', Buffer.byteLength(body))
  res.end(body)
}

function sendError(res: ServerResponse, error: unknown): void {
  if (error instanceof ArchiveError) {
    sendJson(res, error.status, { error: { code: error.code, message: error.message } })
    return
  }
  // 原生 fs 错误消息可能含绝对路径：掩码 home 前缀，与 /trash-dir 的展示口径一致。
  const raw = error instanceof Error ? error.message : String(error)
  sendJson(res, 500, { error: { code: 'IO_ERROR', message: maskHomePath(raw, homedir()) } })
}

async function readJsonBody(req: IncomingMessage): Promise<unknown | ArchiveError> {
  const chunks: Buffer[] = []
  let size = 0
  try {
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.byteLength
      if (size > MAX_BODY_BYTES) {
        return new ArchiveError('BAD_BODY', `请求体超过 ${MAX_BODY_BYTES} 字节上限`)
      }
      chunks.push(buffer)
    }
  } catch {
    return new ArchiveError('BAD_BODY', '读取请求体失败')
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    return new ArchiveError('BAD_BODY', '请求体不是合法 JSON')
  }
}

function bodyObject(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ArchiveError('BAD_BODY', message)
  }
  return value as Record<string, unknown>
}

function titleFromObservation(result: SessionTitleObservationResult | undefined, fallback: string): string {
  if (result?.status !== 'fulfilled') return fallback
  return result.value.title?.title ?? fallback
}

/**
 * 预建「会话 id → 持它的工作区 id 列表」索引（性能审计：热路径无 O(n²)）。
 * /list 组装按节点调用时，旧实现每节点全量扫「工作区 × 会话」；改为一次建索引、全树复用。
 * 输出顺序 = 工作区列表顺序；同一工作区内重复的 sessionId 条目只记一次（对齐旧实现 includes 语义）。
 */
export function workspaceIndexFor(workspaces: readonly Workspace[]): Map<string, readonly string[]> {
  const index = new Map<string, string[]>()
  for (const workspace of workspaces) {
    const workspaceId = String(workspace.id)
    for (const sessionId of workspace.sessionIds) {
      const key = String(sessionId)
      const holders = index.get(key)
      if (holders === undefined) index.set(key, [workspaceId])
      else if (!holders.includes(workspaceId)) holders.push(workspaceId)
    }
  }
  return index
}

/**
 * 活动会话防护：本次 dsh 运行中驻留（未释放）的会话无法被插件卸载——AgentHandle.dispose
 * 是官方 session-controller 持有且被丢弃的 teardown 能力，dsh 无公开「结束会话」
 * API（查证 0.1.2-alpha.1 源码：session / agent 常驻 live store 至进程退出），
 * 硬移目录会被后续回写重建幽灵目录。面板把这类会话在归档区内分组置灰，host 侧兜底拒绝。
 */
function ensureSessionNotLive(ctx: Context, sessionId: SessionId): void {
  const agent = ctx.agents.get(sessionId)
  // 生成中的会话不静默取消用户回合：先让用户停止生成。
  if (agent !== undefined && agent.status === 'running') {
    throw new ArchiveError('SESSION_LIVE', '该会话正在生成回复：请先停止生成后再移入回收站', 409)
  }
  if (agent !== undefined || ctx.sessions.get(sessionId) !== undefined) {
    throw new ArchiveError(
      'SESSION_LIVE',
      '该会话仍被 dsh 进程占用（未释放），无法安全移动其文件：请先关闭该会话（或停止生成）再重试；仍被占用可重启 dsh 后操作',
      409,
    )
  }
}

/** 官方投影缓存域（session_projcache）：移入回收站/删除移走目录后失效对应行，@ 列表不再读到。 */
const PROJCACHE_DOMAIN_NAME = 'session_projcache'
const PROJCACHE_SESSIONS_TABLE = 'sessions'

/**
 * 标题投影缓存读取（spec 09，官方 title 单元 stateSchema = string|null、latest-wins）：
 * live 会话走投影注册表快照；冷会话走 sessionProjectionCache 行（官方 @ 列表同款，
 * list.ts:335 口径）。行值防御性解析（直接字符串或 {title} 对象都接受），无/空返回 undefined。
 */
function cachedTitle(ctx: Context, header: SessionHeader, live: unknown): string | undefined {
  const read = (values: Record<string, unknown> | null | undefined): string | undefined => {
    const raw: unknown = values?.title
    if (typeof raw === 'string') return raw.trim() === '' ? undefined : raw
    const wrapped = (raw as { title?: unknown } | null | undefined)?.title
    if (typeof wrapped === 'string') return wrapped.trim() === '' ? undefined : wrapped
    return undefined
  }
  if (live !== undefined) {
    const registry = ctx.get('sessionProjections') as unknown as {
      snapshot?: (session: unknown, units: readonly string[]) => { values: Record<string, unknown> } | undefined
    } | undefined
    if (registry !== undefined && typeof registry.snapshot === 'function') {
      try {
        const hit = read(registry.snapshot(live, ['title'])?.values)
        if (hit !== undefined) return hit
      } catch (error) {
        ctx.logger.warn(`dsh-archive-manage: 标题投影快照失败（${String(header.id)}）：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return undefined
  }
  const cache = ctx.get('sessionProjectionCache') as unknown as {
    cachedSnapshot?: (header: unknown, cut: unknown, units: readonly string[]) => { values: Record<string, unknown> } | undefined
  } | undefined
  if (cache !== undefined && typeof cache.cachedSnapshot === 'function') {
    try {
      const hit = read(cache.cachedSnapshot(header, 0, ['title'])?.values)
      if (hit !== undefined) return hit
    } catch (error) {
      ctx.logger.warn(`dsh-archive-manage: 标题投影缓存读取失败（${String(header.id)}）：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return undefined
}

/**
 * 批量标题三档（spec 09）：live 投影 → 冷缓存 → 折叠兜底。
 * 折叠共享一个整体预算信号（超时后未完成项按失败处理），最终取不到的 id 落 fallback（默认会话 id）。
 * 返回值包含全部输入 id 的键。
 *
 * 标题批量化（诊断结论 O(m·K) → O(K + m·L)）：全部 miss **整批一次** readTitleSnapshots——
 * 官方 projectMany 每次调用都要先跑一遍全量 listPersisted（corpus.ts:161），逐 id 单条调用是 O(m·K)
 * （m 个 miss = m 次全盘扫描 + m 次全日志折叠，只被 runBounded 的并发压成 ceil(m/4) 轮）；
 * 整批一次即 O(K + m·L)，且官方 projectMany 内部本就是 4 路并发读
 * （config.ts:9，与本插件 TITLE_FOLD_CONCURRENCY 同值）。返回**每个唯一 id 一条**、按首次出现顺序
 * 落定（官方 corpus.ts:137/249），故此处先按 id 去重再回填——输入重复 id 也不会错位。
 * 单条失败只影响该条（取不到 → fallback）；整批抛错（预算已超时等）同样退化为全部 fallback。
 */
export async function titlesFor(
  ctx: Context,
  headers: readonly SessionHeader[],
  fallback: (header: SessionHeader) => string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const misses: SessionHeader[] = []
  for (const header of headers) {
    const hit = cachedTitle(ctx, header, ctx.sessions.get(SessionId(String(header.id))))
    if (hit !== undefined) {
      out.set(String(header.id), hit)
      continue
    }
    misses.push(header)
  }
  if (misses.length === 0) return out
  // 预算信号自建（spec 09 审计）：批结束（成功或失败）即 release，定时器不滞留到死线。
  const budget = createBudgetSignal(TITLE_FOLD_BUDGET_MS)
  try {
    const missingIds = [...new Set(misses.map(header => String(header.id)))]
    const observations = await ctx.sessionQuery.readTitleSnapshots(missingIds.map(id => SessionId(id)), budget.signal)
    const folded = new Map(missingIds.map((id, index) => [id, observations[index]]))
    for (const header of misses) {
      out.set(String(header.id), titleFromObservation(folded.get(String(header.id)), fallback(header)))
    }
    return out
  } catch (error) {
    // 整批失败（含预算超时）：标题退化为 fallback，列表照常返回，不让路由 500。
    ctx.logger.warn(`dsh-archive-manage: 标题折叠失败（${misses.length} 个会话）：${error instanceof Error ? error.message : String(error)}`)
    for (const header of misses) out.set(String(header.id), fallback(header))
    return out
  } finally {
    budget.release()
  }
}

/** 单会话标题（三档 + 兜底折叠；fallback 默认会话 id）。 */
async function readTitle(ctx: Context, header: SessionHeader, fallback: string): Promise<string> {
  return titlesFor(ctx, [header], () => fallback).then(map => map.get(String(header.id)) ?? fallback)
}

async function ensureTrashRoot(trashRoot: string): Promise<void> {
  try {
    await mkdir(trashRoot, { recursive: true })
  } catch (error) {
    throw new ArchiveError('IO_ERROR', `无法创建回收站目录：${error instanceof Error ? error.message : String(error)}`, 500)
  }
}

async function detachWorkspaceAccounting(ctx: Context, sessionId: SessionId): Promise<void> {
  for (const workspace of ctx.workspaceRegistry.list()) {
    if (workspace.sessionIds.includes(sessionId)) {
      await workspace.detachSession(sessionId)
    }
  }
}

async function attachWorkspaceAccounting(ctx: Context, sessionId: SessionId, workspaceIds: readonly string[]): Promise<void> {
  for (const id of workspaceIds) {
    const workspace = ctx.workspaceRegistry.get(WorkspaceId(id))
    if (workspace !== undefined) await workspace.attachSession(sessionId)
  }
}

/**
 * 官方 WorkspaceRegistry 的私有写入面（私有 seam 依赖，AGENTS 三档特例已批，2026-09-01）：
 * TS private 只是编译期约束，JS 运行时成员真实存在；社区插件（huahai0202/dsh-better-archive）
 * 同款通道。通道价值：enqueueOperation（官方写串行链，与官方一切写操作互斥，无需自建队列）+
 * requireState/setState（官方持久化写——域与内存态一步同步，从机制上消除直写域的幽灵问题）。
 */
interface RegistryMutationSurface {
  readonly enqueueOperation: <T>(operation: () => Promise<T>) => Promise<T>
  readonly requireState: () => WorkspaceDomainState
  readonly setState: (state: WorkspaceDomainState) => Promise<void>
}

const REGISTRY_MUTATION_METHODS = ['enqueueOperation', 'requireState', 'setState'] as const

/**
 * 启动能力检查（私有 seam 护栏）：官方升级改动 private surface 时 fail-fast。
 * 抛错只让本插件不可用——cordis 对插件启动错误逐插件捕获并 logger.error，
 * 不影响 dsh 本体与其余插件（已查证 cordis lib/index.js）。
 */
export function assertRegistryMutationApi(registry: unknown): RegistryMutationSurface {
  const missing = REGISTRY_MUTATION_METHODS.filter(method => typeof (registry as Record<string, unknown>)?.[method] !== 'function')
  if (missing.length > 0) {
    throw new Error(`不支持的 DSH workspace registry：缺少私有写入方法 ${missing.join('、')}；请升级插件以匹配当前 dsh 版本`)
  }
  return registry as unknown as RegistryMutationSurface
}

/**
 * sessionPersistence.list() 双形状兼容读取：
 * - npm 0.1.2-alpha.5 及更早：直接返回 SessionHeader[]；
 * - alpha.5 发布后的 master（2026-09-02 会话持久化重构）：返回 Snapshot[]（{ header, revision, ... }）。
 * 按元素是否携带 header 字段分流，统一返回 SessionHeader[]（见 AGENTS 插件私有 seam 特例）。
 */
export async function storedHeaders(ctx: Context): Promise<SessionHeader[]> {
  return (await storedHeaderFacts(ctx)).headers
}

/** header 事实缓存承载类型（spec 09）：全量 header + 快照 size 映射。 */
type HeaderFacts = { headers: SessionHeader[]; sizes: Map<string, number> }

/** list() 双形状兼容读取 + 快照附加信息（sizeBytes，仅 master 快照形状有）。 */
export async function storedHeaderFacts(ctx: Context): Promise<HeaderFacts> {
  const entries = await ctx.sessionPersistence.list() as readonly unknown[]
  const headers: SessionHeader[] = []
  const sizes = new Map<string, number>()
  for (const entry of entries) {
    const record = entry as Record<string, unknown> | null | undefined
    const header = record?.header
    if (typeof header === 'object' && header !== null && typeof (header as Record<string, unknown>).id === 'string') {
      headers.push(header as SessionHeader)
      const sizeBytes = record?.sizeBytes
      if (typeof sizeBytes === 'number') sizes.set(String((header as SessionHeader).id), sizeBytes)
    } else {
      headers.push(entry as SessionHeader)
    }
  }
  return { headers, sizes }
}

/** 会话统计/列表元数据（projcache 行，缺失返回 undefined）。 */
function sessionFacts(ctx: Context, sessionId: string): SessionFacts | undefined {
  try {
    const domain = ctx.storageDomain.get(PROJCACHE_DOMAIN_NAME)
    if (domain === undefined) return undefined
    return parseSessionFacts(domain.table(PROJCACHE_SESSIONS_TABLE).get(sessionId))
  } catch {
    return undefined
  }
}

/**
 * 私有 locate 方法的返回形状：本插件只用到 kind 与 path（见 sessionDirectoryFor）。
 * 0.1.5-rc.1 起官方不再把它放在公开 SessionPersistence 类型上，故不能直接用该类型。
 */
export interface SessionLocationLike {
  readonly kind: string
  readonly path: string
}

/** 受检后的私有 locate 访问器。 */
export interface SessionLocationApi {
  locate(header: SessionHeader): SessionLocationLike | undefined
}

/**
 * 私有 seam 依赖：sessionPersistence.locate。alpha.5 发布后的 master 把它从公开服务契约
 * 降为 jsonl 后端私有方法，0.1.5-rc.1 已从公开类型 `SessionPersistence` 上消失（运行时成员仍在，
 * 插件只读使用、不替换不覆写）。缺失即 fail-fast，并返回结构化访问器供各调用点使用
 * （与 registry 写通道同款护栏）。
 */
export function assertSessionLocationApi(persistence: unknown): SessionLocationApi {
  const locate = (persistence as Record<string, unknown> | null | undefined)?.locate
  if (typeof locate !== 'function') {
    throw new Error('不支持的 DSH session persistence：缺少私有 locate 方法；请升级插件以匹配当前 dsh 版本')
  }
  return persistence as unknown as SessionLocationApi
}

/**
 * 构造官方 api-session/added 的载荷（SessionSummary 结构化子集）：仅 sessionId/updatedAt/
 * running/blank 必填，其余字段按 header 可选透出。非驻留会话没有活跃事件时间，
 * updatedAt 用 header.createdAt（与 /list 列表口径一致）。
 */
export function addedSummaryFor(header: SessionHeader, blank: boolean): {
  sessionId: SessionId
  updatedAt: number
  running: boolean
  blank: boolean
  parentSessionId?: SessionId
  origin?: 'subagent'
  cwd?: string
} {
  return {
    sessionId: header.id,
    updatedAt: header.createdAt,
    running: false,
    blank,
    ...header.parentSession === undefined ? {} : { parentSessionId: header.parentSession },
    ...header.origin === 'subagent' ? { origin: 'subagent' as const } : {},
    ...header.cwd === undefined ? {} : { cwd: header.cwd },
  }
}

/**
 * unarchive 后补发官方 api-session/added：客户端 handleSessionAdded 即时并入会话列表，
 * 用户无需刷新页面。不发出则用户必须刷新——刷新会触发 dsh 把会话加载进 live store，
 * 之后「再归档 → 进回收站」会被 hold 守卫（ensureSessionNotLive）拦下。
 * spec 09 审计：headers 经 header 事实缓存取，与 /list /strays 共享单飞，不单独扫盘。
 */
async function emitSessionAdded(ctx: Context, sessionId: SessionId, headerFacts: HeaderFactsStore<HeaderFacts>): Promise<void> {
  try {
    const { headers } = await headerFacts.get()
    const header = headers.find(candidate => String(candidate.id) === String(sessionId))
    if (header === undefined) return
    ctx.emit('api-session/added', addedSummaryFor(header, await readStrayBlankness(ctx, sessionId)))
  } catch (error) {
    ctx.logger.warn(`dsh-archive-manage: api-session/added 通知失败（${String(sessionId)}）：${error instanceof Error ? error.message : String(error)}`)
  }
}

/** SessionHeader → 纯逻辑树结构（spec 08）。 */
function treeHeaderOf(header: SessionHeader): SessionTreeHeader {
  return {
    id: String(header.id),
    createdAt: header.createdAt,
    ...header.parentSession === undefined ? {} : { parentSession: String(header.parentSession) },
    ...header.origin === 'subagent' ? { origin: 'subagent' as const } : {},
  }
}

/** 树内全部节点 id（前序遍历，供批量标题读取）。 */
function treeIds(nodes: readonly SessionTreeNode[]): string[] {
  const out: string[] = []
  for (const node of nodes) {
    out.push(node.header.id)
    out.push(...treeIds(node.children))
  }
  return out
}

/** 第三档（冷、未种子）从日志重新折叠投影的单次观察超时。 */
const LABEL_FOLD_TIMEOUT_MS = 15_000

/** 折叠标签记忆上限（spec 09 审计）：记忆随观察过的会话数增长，设 LRU 上限防无界累积。 */
export const FOLDED_LABEL_CACHE_MAX_ENTRIES = 256

/**
 * 日志折叠的 subagent 标签结论记忆：描述符事件一旦写入即不可变（官方注释 "a descriptor is
 * immutable once appended"），归档会话日志静止，按 sessionId 记忆安全。
 * 值 = 折叠出的标签；`null` = 权威判定「该会话没有标签」（同样值得记——否则每次打开面板
 * 都要为它重折一遍整份日志）。非权威结果（折叠失败、生命周期不匹配）不记。
 * LRU 上限淘汰最久未用条目（sessionId 为 UUID，删除后重建同 id 的可能性忽略不计）。
 */
const foldedSubagentLabels = createLruCache<string, string | null>(FOLDED_LABEL_CACHE_MAX_ENTRIES)

/** observeSession 观察结果（租约，用后必须 dispose）的最小结构。 */
interface FoldObservation {
  header?: { createdAt?: number }
  projections?: { values?: Record<string, SubagentIdentityValue | null | undefined> }
  dispose?: () => void
  /** rc.1 起官方观察租约是 Disposable 契约（[Symbol.dispose]），旧中间版是 dispose() 方法；两者都探测。 */
  [Symbol.dispose]?: () => void
}

/**
 * identity.seq → 官方 SessionSeq 品牌值；畸形值（缺失 / 负数 / 非安全整数 / -0）返回 undefined。
 * 官方 `SessionSeq()` 对非法输入抛 TypeError，本插件把它当「无法验证自有性」处理，不抛给调用方。
 */
function ownSeqOf(value: number | undefined): SessionSeq | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) return undefined
  return SessionSeq(value)
}

/**
 * 子会话标签：官方 subagent 投影单元 label（父会话给子会话的任务描述，不受父消息污染）。
 * 三档读链，与官方 list-children 同构——缓存只是捷径，日志才是权威，缓存坏掉只变慢、不变错：
 *   1. live 子会话 → 投影注册表快照（内存、同步；官方对 live 只走这一档，observeSession 会悬挂）；
 *   2. 冷会话 → 投影缓存行（展示级；行自带 identity + ver 校验，见下）；
 *   3. 冷 + 未种子 + 缓存行未给出权威结论 → observeSession 从日志重新折叠（官方同款权威兜底）。
 *      9-03 的 OOM 是「种子冷会话连带读父会话前缀」——isSeeded 门把该场景挡在档外，
 *      而不是禁用整条正路；观察是租约，用后 dispose，15s 超时防悬挂。
 * 均做能力检查 + 结构断言，失败返回 undefined，调用方回退标题单元结果。
 *
 * spec 10：第二档的判定从「取到 label 才算命中」改为「identity 非 null 即权威」——
 * one-shot 子会话的 label 官方定义为可选（projection-types.ts:30-33），此前这类会话
 * 每个都掉进第三档，把整份 zstd 日志解出来重折一遍（本机 10 个子会话 ≈ 8MB 压缩日志
 * ≈ 1s/次打开，且因折不出 label 永不进记忆 → 每次打开都重来）。
 */
export async function subagentLabel(ctx: Context, header: SessionHeader): Promise<string | undefined> {
  const sessionId = SessionId(String(header.id))
  const live = ctx.sessions.get(sessionId)
  if (live !== undefined) {
    const registry = ctx.get('sessionProjections') as unknown as {
      snapshot?: (session: unknown, units: readonly string[]) => { values: Record<string, SubagentIdentityValue | null | undefined> }
    } | undefined
    if (registry !== undefined && typeof registry.snapshot === 'function') {
      try {
        const identity = registry.snapshot(live, ['subagent']).values.subagent
        if (identity === null || typeof identity !== 'object') return undefined
        // 自有后缀门（spec 10 审计，对齐官方 list-children.ts:224-225）：identity 必须折自
        // 子会话**自有**事件。fork 子会话在「自己的描述符写入前」的创建窗口里，快照带的是
        // seed 继承的祖先描述符——不挡就会把祖先标签显示成这个子会话的标签（官方此时不出行）。
        // seq 畸形 / 缺官方 isOwnSeq（不支持的 dsh）一律按「无法验证自有性」保守不出行。
        const seq = ownSeqOf(identity.seq)
        if (seq === undefined || typeof live.isOwnSeq !== 'function' || !live.isOwnSeq(seq)) return undefined
        return labelFromSubagentIdentity(identity) ?? undefined
      } catch (error) {
        ctx.logger.warn(`dsh-archive-manage: subagent 投影快照失败（${String(sessionId)}）：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return undefined
  }
  const cache = ctx.get('sessionProjectionCache') as unknown as {
    cachedSnapshot?: (header: unknown, cut: unknown, units: readonly string[]) => { values: Record<string, SubagentIdentityValue | null | undefined> } | undefined
  } | undefined
  if (cache !== undefined && typeof cache.cachedSnapshot === 'function') {
    try {
      // 行的可靠性由官方保证：cachedSnapshot 先过 identityMatches（createdAt/cwd/isSeeded/
      // inheritedEventCount，session-projection-cache/src/index.ts:377，由 recordFor:116 调用）
      // 验「这份缓存属于这条生命周期」，viewCheckpoint 再丢弃 ver 与 live unit 不一致的行
      // （session-projection/src/index.ts:448）。所以拿到的 identity 是这份日志的有效折叠
      // 结果，可以直接当权威结论用。
      const settled = labelFromSubagentIdentity(cache.cachedSnapshot(header, 0, ['subagent'])?.values?.subagent)
      if (settled !== undefined) return settled ?? undefined // 有标签返回标签；权威无标签直接结束（不再折叠）
    } catch (error) {
      ctx.logger.warn(`dsh-archive-manage: subagent 投影缓存读取失败（${String(sessionId)}）：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (!header.isSeeded) {
    const memoized = foldedSubagentLabels.get(String(sessionId))
    // null 亦为结论（该会话确实没有标签）：命中就不必再折一次整份日志。
    if (memoized !== undefined) return memoized ?? undefined
    const query = ctx.get('sessionQuery') as unknown as {
      observeSession?: (id: unknown, options: { signal?: AbortSignal }) => Promise<FoldObservation>
    } | undefined
    if (query !== undefined && typeof query.observeSession === 'function') {
      let observation: FoldObservation | undefined
      // 预算信号自建（spec 09 审计）：成功与失败路径都 release，定时器不滞留到死线。
      const budget = createBudgetSignal(LABEL_FOLD_TIMEOUT_MS)
      try {
        observation = await query.observeSession(sessionId, { signal: budget.signal })
        // 生命周期见证：同 id 槽位被删后重建（createdAt 变化）不得串用旧观察。
        if (observation !== undefined
          && (observation.header?.createdAt === undefined || observation.header.createdAt === header.createdAt)) {
          const settled = labelFromSubagentIdentity(observation.projections?.values?.subagent)
          // 只记权威结论：折叠失败 / identity 缺失不记，下次仍可重试。
          if (settled !== undefined) {
            foldedSubagentLabels.set(String(sessionId), settled)
            return settled ?? undefined
          }
        }
      } catch (error) {
        ctx.logger.warn(`dsh-archive-manage: subagent 标签日志折叠失败（${String(sessionId)}）：${error instanceof Error ? error.message : String(error)}`)
      } finally {
        budget.release()
        try {
          // rc.1 租约走 [Symbol.dispose]，旧中间版走 dispose()；释放失败不影响回退。
          if (observation !== undefined) {
            if (typeof observation.dispose === 'function') observation.dispose()
            else observation[Symbol.dispose]?.()
          }
        } catch {
          // 租约释放 best-effort：失败不影响回退。
        }
      }
    }
  }
  return undefined
}

/** 批量子会话标签（spec 09：有界并发折叠，与标题兜底同一并发上限；header.id → label，取不到的 id 不在映射中）。 */
async function subagentLabels(ctx: Context, headers: readonly SessionHeader[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const results = await runBounded(headers, TITLE_FOLD_CONCURRENCY, header => subagentLabel(ctx, header))
  headers.forEach((header, index) => {
    const label = results[index]
    if (label !== undefined) out.set(String(header.id), label)
  })
  return out
}

/**
 * 父子归档对齐（spec 08 状态不变量：子镜像父）：
 * - 「父已归档而子未归档」→ 子补进归档集；「父未归档而子已归档」→ 子移出。
 * - 触发：启动 + 官方 workspace 域写入事件（domain/changed）+ 面板打开惰性兜底；幂等。
 * - spec 09 审计：headers 经 header 事实缓存取（缓存层单飞/TTL/写穿失效），
 *   面板打开不再为对齐做全量扫盘（此前每次 /list 都直接 list() 一次）。
 */
export async function alignChildArchives(
  ctx: Context,
  surface: RegistryMutationSurface,
  headerFacts: HeaderFactsStore<HeaderFacts>,
): Promise<void> {
  try {
    const { headers } = await headerFacts.get()
    const archived = await readArchivedIds(ctx)
    const { add, remove } = archiveAlignmentForChildren(headers.map(treeHeaderOf), archived.map(String))
    if (add.length === 0 && remove.length === 0) return
    await mutateArchivedSet(surface, ids => {
      const next = new Set(ids.map(String))
      for (const id of add) next.add(id)
      for (const id of remove) next.delete(id)
      return [...next].map(id => SessionId(id))
    })
    ctx.logger.info(`dsh-archive-manage: 父子归档对齐 +${add.length} / -${remove.length}`)
  } catch (error) {
    ctx.logger.warn(`dsh-archive-manage: 父子归档对齐失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

/** 读归档集：官方公开 getter（通道迁移后内存态与域恒同步，无需再直读域）。 */
async function readArchivedIds(ctx: Context): Promise<SessionId[]> {
  return [...ctx.workspaceRegistry.archivedSessionIds]
}

/**
 * 归档集读改写：挂官方 enqueueOperation 串行链，链内 requireState → 计算新集合 →
 * setState（官方持久化写：域 + 内存态一步同步）。update 返回同一引用或内容逐项一致视为无变化
 * （removeArchivedId 的 filter 恒返回新数组，内容比较才能让「不在集合内」真正零写入、零事件噪音）。
 */
export function mutateArchivedSet(surface: RegistryMutationSurface, update: (ids: readonly SessionId[]) => readonly SessionId[]): Promise<void> {
  return surface.enqueueOperation(async () => {
    const state = surface.requireState()
    const next = update(state.archivedSessionIds)
    if (next === state.archivedSessionIds) return
    const unchanged = next.length === state.archivedSessionIds.length
      && next.every((id, index) => String(id) === String(state.archivedSessionIds[index]))
    if (unchanged) return
    await surface.setState({ ...state, archivedSessionIds: [...next] })
  })
}

/** 从归档集移除会话（取消归档 / 移入回收站 / 彻底删除共用）；不在集合内幂等无操作。 */
async function removeArchivedId(surface: RegistryMutationSurface, sessionId: SessionId): Promise<void> {
  await mutateArchivedSet(surface, ids => ids.filter(id => String(id) !== String(sessionId)))
}

/**
 * 移入回收站 / 彻底删除后的归档集清理：摘「根 + 实际被搬走/删掉的**全部后代**子会话」一次写链。
 * 官方持久化是扁平同级布局（sessionDir = projectDir/encodeSegment(id)，子会话继承父 cwd），
 * trash/delete 逐个搬运/删除整棵子树的目录，故整棵子树都要出归档集——只摘直接子会话会把
 * 深度 ≥2 的后代永久留成孤儿根（父已不在 headers，父子对齐对孤儿不参与，摘不回来）。
 * 待摘 id 由调用方用 archivedIdsToRemove(根, 全部后代 id) 给出。
 */
export async function removeArchivedIds(surface: RegistryMutationSurface, ids: readonly string[]): Promise<void> {
  const remove = new Set(ids)
  await mutateArchivedSet(surface, current => current.filter(id => !remove.has(String(id))))
}

/** 把会话加回归档集（回收站还原后回归隐藏态）；已在集合内幂等无操作。 */
async function addArchivedId(surface: RegistryMutationSurface, sessionId: SessionId): Promise<void> {
  await mutateArchivedSet(surface, ids => ids.some(id => String(id) === String(sessionId)) ? ids : [...ids, sessionId])
}

/**
 * 启动清扫：归档集里不在持久化中的幽灵 id 清理掉（历史遗留防御——旧版本直写时代可能已
 * 产生幽灵条目；通道迁移后不再产生新幽灵，保留一次性防御）。
 * spec 09 审计：headers 经 header 事实缓存取，与其余启动读取共享同一次扫盘。
 */
async function sweepGhostArchivedIds(
  ctx: Context,
  surface: RegistryMutationSurface,
  headerFacts: HeaderFactsStore<HeaderFacts>,
): Promise<void> {
  try {
    const { headers } = await headerFacts.get()
    const known = new Set(headers.map(header => String(header.id)))
    const current = await readArchivedIds(ctx)
    const cleaned = current.filter(id => known.has(String(id)))
    if (cleaned.length === current.length) return
    await mutateArchivedSet(surface, () => cleaned)
    ctx.logger.warn(`dsh-archive-manage: 启动清扫移除 ${current.length - cleaned.length} 个幽灵归档 id`)
  } catch (error) {
    ctx.logger.warn(`dsh-archive-manage: 启动清扫失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

/** 失效官方投影缓存行（派生数据，可安全删除；官方服务常驻打开该域，走 get）。 */
async function invalidateProjectionCache(ctx: Context, sessionId: SessionId): Promise<void> {
  try {
    const domain = ctx.storageDomain.get(PROJCACHE_DOMAIN_NAME)
    if (domain === undefined) return
    await domain.table(PROJCACHE_SESSIONS_TABLE).delete(String(sessionId))
  } catch (error) {
    ctx.logger.warn(`dsh-archive-manage: 投影缓存失效失败（${String(sessionId)}）：${error instanceof Error ? error.message : String(error)}`)
  }
}
/** 移入回收站/删除后校验投影缓存是否已删除；未删除时重试一次并告警，供启动清扫兜底。 */
async function invalidateProjectionCacheGuarded(ctx: Context, sessionId: SessionId): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    await invalidateProjectionCache(ctx, sessionId)
    try {
      const domain = ctx.storageDomain.get(PROJCACHE_DOMAIN_NAME)
      if (domain === undefined || domain.table(PROJCACHE_SESSIONS_TABLE).get(String(sessionId)) === undefined) return
    } catch (error) {
      ctx.logger.warn(`dsh-archive-manage: 投影缓存校验失败（${String(sessionId)}）：${error instanceof Error ? error.message : String(error)}`)
      return
    }
    if (attempt === 1) ctx.logger.warn(`dsh-archive-manage: 移入回收站/删除后投影缓存仍残留 ${String(sessionId)}，重启后启动清扫会再次清理`)
  }
}

/** 游离会话的「空白」判定：只读官方投影行（与失效投影行同域，见 AGENTS seam 特例）；读失败按非空白保守处理。 */
async function readStrayBlankness(ctx: Context, sessionId: SessionId): Promise<boolean> {
  try {
    const domain = ctx.storageDomain.get(PROJCACHE_DOMAIN_NAME)
    if (domain === undefined) return false
    const row = domain.table(PROJCACHE_SESSIONS_TABLE).get(String(sessionId))
    return parseBlankProjection(row)?.blank === true
  } catch {
    return false
  }
}

/** 启动清扫：投影缓存中不在 sessionPersistence.list() 里的会话行删除，@ 列表与真实持久化保持一致。 */
async function sweepStaleProjectionCache(ctx: Context, headerFacts: HeaderFactsStore<HeaderFacts>): Promise<void> {
  try {
    const domain = ctx.storageDomain.get(PROJCACHE_DOMAIN_NAME)
    if (domain === undefined) return
    const { headers } = await headerFacts.get()
    const known = new Set(headers.map(header => String(header.id)))
    const table = domain.table(PROJCACHE_SESSIONS_TABLE)
    let removed = 0
    for (const key of [...table.keys()]) {
      if (known.has(String(key))) continue
      await table.delete(String(key))
      removed++
    }
    if (removed > 0) ctx.logger.warn(`dsh-archive-manage: 启动清扫投影缓存移除 ${removed} 个陈旧会话`)
  } catch (error) {
    ctx.logger.warn(`dsh-archive-manage: 投影缓存启动清扫失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

/** 只有已知的「单会话目录」后端（当前为 jsonl）才允许文件级移动 / 删除。 */
export function sessionDirectoryFor(location: { kind: string; path: string }): string | undefined {
  if (location.kind !== 'jsonl') return undefined
  // 宿主字段漂移防御（审计 B1，2026-09-10）：path 非字符串/为空时返回 undefined，让调用方走
  // 既有的 BACKEND_UNSUPPORTED 降级（backendSupported:false / 501），而不是 dirname(undefined) 抛穿整条路由。
  if (typeof location.path !== 'string' || location.path === '') return undefined
  const dir = dirname(location.path)
  if (!isAbsolute(dir) || dirname(dir) === dir || basename(dir) === '') return undefined
  return dir
}
interface SubagentTarget {
  readonly sessionId: SessionId
  readonly header: SessionHeader
  readonly dir: string
}

/** 宿主真值格式门（请求期）：header 由宿主给出，不受「插件解析到旧版官方包」影响。
 *  不支持即拒绝——本插件的操作会移动/删除会话目录，认错格式的代价是丢数据。 */
function assertHeaderFormatSupported(header: SessionHeader): void {
  const reason = unsupportedStoredFormatReason([header])
  if (reason === undefined) return
  throw new ArchiveError('BACKEND_UNSUPPORTED', `${reason}；已拒绝本次操作（升级本插件后自动恢复）`, 501)
}

/** 找出某个父会话下的**全部后代** subagent 会话（任意深度）；任一会话仍被占用时不处理任何文件。
 *  子代理自身也能再派子代理（官方 header 有 `delegationDepth`，subagent 工具可嵌套），故不能只取
 *  直接子会话：深度 ≥2 的后代目录留在磁盘上，父已缺位后它们要么以孤儿根浮现在归档区根级、
 *  要么落进游离区（2026-09-12 实测：两个孙会话在其祖父会话入回收站后掉出来，用户只能逐个再操作）。
 *  spec 09 审计：headers 经 header 事实缓存取，与同请求的主 header 查表口径一致。 */
async function listSubagentTargets(
  ctx: Context,
  parentSessionId: SessionId,
  headerFacts: HeaderFactsStore<HeaderFacts>,
): Promise<SubagentTarget[]> {
  const { headers } = await headerFacts.get()
  const byId = new Map(headers.map(header => [String(header.id), header]))
  // 全后代（BFS，父在子前）；id 由 subagentDescendantIds 从同一份 headers 产出，故查表不会落空。
  const descendantIds = subagentDescendantIds(headers.map(treeHeaderOf), String(parentSessionId))
  const targets: SubagentTarget[] = []
  for (const id of descendantIds) {
    const header = byId.get(id)
    // 防御分支：上游 header 形状变化时宁可少搬一个目录，也不要在 undefined 上取字段抛穿整条路由。
    if (header === undefined) continue
    assertHeaderFormatSupported(header)
    const sessionId = SessionId(String(header.id))
    if (ctx.sessions.get(sessionId) !== undefined || ctx.agents.get(sessionId) !== undefined) {
      throw new ArchiveError('SESSION_LIVE', `subagent 会话 ${String(sessionId)} 仍被 dsh 进程占用，不能与父会话一起处理`, 409)
    }
    const location = assertSessionLocationApi(ctx.sessionPersistence).locate(header)
    const dir = location === undefined ? undefined : sessionDirectoryFor(location)
    if (dir === undefined) {
      throw new ArchiveError('BACKEND_UNSUPPORTED', `subagent 会话 ${String(sessionId)} 的持久化后端不支持文件级处理`, 501)
    }
    targets.push({ sessionId, header, dir })
  }
  return targets
}

/** 回收站目录内 subagent 子目录名必须安全（兼容官方 encodeSegment 转义形式），防 sidecar 篡改后路径穿越。 */
function safeDirName(value: string): string {
  if (!isSafeSessionDirName(value)) throw new ArchiveError('BAD_BODY', `非法会话目录名：${value}`)
  return value
}

/** 保证传入目录名只能落到 trashRoot 下。 */
export function resolveTrashDir(trashRoot: string, trashId: string): string {
  const candidate = resolve(trashRoot, sanitizeSegment(trashId))
  const prefix = resolve(trashRoot)
  if (candidate !== prefix && !candidate.startsWith(`${prefix}${sep}`)) {
    throw new ArchiveError('BAD_BODY', '非法的回收站 id')
  }
  return candidate
}

async function listTrashItems(trashRoot: string): Promise<unknown[]> {
  const names = await trashDirNames(trashRoot)
  const items: unknown[] = []
  for (const name of names) {
    const dir = resolveTrashDir(trashRoot, name)
    try {
      const raw = await readFile(join(dir, TRASH_SIDECAR), 'utf8')
      const sidecar = parseTrashSidecar(JSON.parse(raw))
      if (sidecar !== undefined) {
        items.push(trashItemView(name, sidecar))
      }
    } catch {
      // 无合法 sidecar：按旧格式目录收纳（只列/删，不可还原）。
      try {
        const info = await stat(dir)
        if (info.isDirectory()) items.push(legacyTrashItem(name, info.mtimeMs))
      } catch {
        // 目录不存在或不可读：跳过，不让列表挂死。
      }
    }
  }
  return items.sort((left, right) => String((right as { archivedAt?: string }).archivedAt ?? '').localeCompare(String((left as { archivedAt?: string }).archivedAt ?? '')))
}

/** 列出回收站根下符合安全命名的目录名。 */
async function trashDirNames(trashRoot: string): Promise<string[]> {
  try {
    const names = await readdir(trashRoot)
    return names.filter(name => /^[A-Za-z0-9_-]+$/u.test(name))
  } catch {
    return []
  }
}

/** 按 sidecar 还原单个回收站条目（移动回原处 + 工作区记账 + 归档集回填）。 */
async function restoreTrashDir(ctx: Context, surface: RegistryMutationSurface, trashDir: string): Promise<ArchiveSidecar> {
  let sidecar: ArchiveSidecar | undefined
  try {
    const raw = await readFile(join(trashDir, TRASH_SIDECAR), 'utf8')
    sidecar = parseTrashSidecar(JSON.parse(raw))
  } catch {
    throw new ArchiveError('UNKNOWN_TRASH', '该条目是旧格式（缺少 sidecar），无法还原；只能彻底删除', 400)
  }
  if (sidecar === undefined) {
    throw new ArchiveError('BAD_BODY', '回收站条目 sidecar 无效', 404)
  }
  // sidecar 校验：originalPath 必须是「绝对路径 + 安全命名的单层目录」（兼容官方 encodeSegment 转义形式），
  // 防被篡改后把回收站条目 rename 到任意位置。
  if (!isAbsolute(sidecar.originalPath)
    || dirname(sidecar.originalPath) === sidecar.originalPath
    || !isSafeSessionDirName(basename(sidecar.originalPath))) {
    throw new ArchiveError('UNKNOWN_TRASH', '该条目 sidecar 的原始路径不合法，拒绝还原', 400)
  }
  const sessionId = SessionId(sidecar.sessionId)
  if (ctx.sessions.get(sessionId) !== undefined || ctx.agents.get(sessionId) !== undefined) {
    throw new ArchiveError('SESSION_LIVE', '该会话仍被 dsh 进程占用（未释放），不能重复还原')
  }

  const subagentTargets = (sidecar.subagents ?? []).map(child => {
    const childId = SessionId(child.sessionId)
    if (!isAbsolute(child.originalPath)
      || dirname(child.originalPath) === child.originalPath
      || !isSafeSessionDirName(basename(child.originalPath))) {
      throw new ArchiveError('UNKNOWN_TRASH', `subagent 会话 ${String(childId)} 的原始路径不合法，拒绝还原`, 400)
    }
    if (ctx.sessions.get(childId) !== undefined || ctx.agents.get(childId) !== undefined) {
      throw new ArchiveError('SESSION_LIVE', `subagent 会话 ${String(childId)} 仍被 dsh 进程占用（未释放），不能重复还原`)
    }
    return { childId, originalPath: child.originalPath, workspaceIds: child.workspaceIds }
  })
  try {
    await mkdir(dirname(sidecar.originalPath), { recursive: true })
  } catch (error) {
    throw new ArchiveError('IO_ERROR', `无法创建还原目录：${error instanceof Error ? error.message : String(error)}`, 500)
  }
  let targetDirExists = false
  try {
    const entries = await readdir(sidecar.originalPath)
    if (entries.length > 0) {
      throw new ArchiveError('TARGET_EXISTS', '原始会话位置已存在内容（可能此前已还原成功），拒绝覆盖还原')
    }
    targetDirExists = true
  } catch (error) {
    if (error instanceof ArchiveError) throw error
    // 目录不存在可继续；其他读取错误由后续 rename 报出。
  }
  if (targetDirExists) {
    await rm(sidecar.originalPath, { recursive: true, force: false })
  }
  await rename(trashDir, sidecar.originalPath)
  // 记账 sidecar 在回收站目录里，上面这次 rename 会把它一起带回会话目录（spec 13）：它是回收站元数据
  // （含标题与原工作区记账 id），留在用户数据目录里只会被官方日志导出/打包捎带。**紧跟 rename 清理**：
  // 排在 subagent 移回之前，因为那条路径失败会直接抛出，放在末尾的清理就再也不会执行（审计 S2）；
  // 此刻条目已被 rename 走，删它不会把回收站条目退化成「无 sidecar 的旧格式条目」。删不掉只告警。
  try {
    await rm(join(sidecar.originalPath, TRASH_SIDECAR), { force: true })
  } catch (error) {
    ctx.logger.warn(`dsh-archive-manage: 还原后回收站记账文件清理失败（${sidecar.originalPath}）：${error instanceof Error ? error.message : String(error)}`)
  }
  for (const target of subagentTargets) {
    try {
      await mkdir(dirname(target.originalPath), { recursive: true })
      await rename(join(sidecar.originalPath, 'subagents', safeDirName(basename(target.originalPath))), target.originalPath)
    } catch (error) {
      // 父目录已移回，属「已还原但 subagent 未移回」——明确提示，避免重试撞 TARGET_EXISTS。
      throw new ArchiveError('IO_ERROR', `父会话已还原，但 subagent 会话目录移回失败（${String(target.childId)}，请勿重复还原）：${error instanceof Error ? error.message : String(error)}`, 500)
    }
  }
  try {
    await rm(join(sidecar.originalPath, 'subagents'), { recursive: true, force: false })
  } catch {
    // subagents 目录不存在时忽略。
  }
  try {
    await attachWorkspaceAccounting(ctx, sessionId, sidecar.workspaceIds)
    for (const target of subagentTargets) {
      try {
        await attachWorkspaceAccounting(ctx, target.childId, target.workspaceIds)
      } catch (childError) {
        ctx.logger.warn(`dsh-archive-manage: 还原后 subagent 工作区记账失败（${String(target.childId)}）：${String(childError)}`)
      }
    }
  } catch (error) {
    // 目录已移回，属「已还原但记账失败」——明确提示，避免重试撞 TARGET_EXISTS。
    throw new ArchiveError('IO_ERROR', `会话已还原，但工作区记账失败（请勿重复还原）：${error instanceof Error ? error.message : String(error)}`, 500)
  }
  try {
    await addArchivedId(surface, sessionId)
  } catch (cleanupError) {
    ctx.logger.warn(`dsh-archive-manage: 还原后归档集同步失败：${String(cleanupError)}`)
  }
  return sidecar
}

/**
 * host half 入口：归档会话管理路由。
 * @param ctx - DSH 插件上下文。
 * @param config - 插件配置（cordis.patch.yml 注入）。
 */
export function apply(ctx: Context, config: Readonly<Partial<ArchiveConfig>> = {}): void {
  // 宿主兼容自检（根 AGENTS《插件与宿主兼容》，先于一切注册）：会话格式不认识就整个停用。
  // 本插件按目录移动/删除会话文件——宁可停用，也不要在不认识的格式上执行不可逆操作。
  assertHostCompatible(ctx, name)
  const settings = normalizeArchiveConfig(config)
  // 私有 seam 依赖：官方 WorkspaceRegistry 的 enqueueOperation/requireState/setState（AGENTS 三档特例，2026-09-01）。
  const surface = assertRegistryMutationApi(ctx.workspaceRegistry)
  // 私有 seam 依赖：sessionPersistence.locate（2026-09-02 起公开契约降为后端私有方法，运行时仍在）。
  assertSessionLocationApi(ctx.sessionPersistence)

  // spec 09：header 事实缓存（单飞 + TTL）。写穿失效见下方事件监听与写路由；
  // jsonl header 物化后不可变，按 id 缓存安全，成员增减由事件与自身写操作失效。
  const headerFacts = createHeaderFactsStore(() => storedHeaderFacts(ctx), HEADER_CACHE_TTL_MS)

  // 启动清扫（均不影响加载）：归档集幽灵 id（历史遗留）、投影缓存陈旧行。
  // spec 09 审计：三项启动读取（清扫 ×2 + 对齐）共享 header 事实缓存单飞，启动只扫一次盘。
  void sweepGhostArchivedIds(ctx, surface, headerFacts)
  void sweepStaleProjectionCache(ctx, headerFacts)

  // spec 08 父子联动：启动对齐 + 官方 workspace 域写入事件驱动实时对齐（幂等，官方 feed 同款监听）。
  // spec 09：同事件写穿失效 header 缓存（官方菜单归档等外部写不经过本插件路由）。
  void alignChildArchives(ctx, surface, headerFacts)
  ctx.effect(() => ctx.on('domain/changed', (change) => {
    if (change.domain !== 'workspace' || change.operation !== 'put') return
    headerFacts.invalidate()
    void alignChildArchives(ctx, surface, headerFacts)
  }), 'dsh-archive-manage: 父子归档对齐')

  // spec 09：会话进出事件写穿失效 header 缓存（自身写操作补发的 removed/added 亦经此路径）。
  ctx.effect(() => ctx.on('api-session/added', () => headerFacts.invalidate()), 'dsh-archive-manage: header 缓存失效（added）')
  ctx.effect(() => ctx.on('api-session/removed', () => headerFacts.invalidate()), 'dsh-archive-manage: header 缓存失效（removed）')

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler: async (req, res) => {
      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
      try {
        if (req.method === 'GET' && pathname === `${PREFIX}/list`) {
          // spec 08：归档区 = 已归档会话的父子树；先惰性对齐再构建（事件驱动之外的兜底）。
          await alignChildArchives(ctx, surface, headerFacts)
          const { headers, sizes } = await headerFacts.get()
          const byId = new Map(headers.map(header => [String(header.id), header]))
          const archivedIds = new Set((await readArchivedIds(ctx)).map(String))
          const archivedHeaders = headers.filter(header => archivedIds.has(String(header.id)))
          const tree = buildSessionTree(archivedHeaders.map(treeHeaderOf))
          const ids = treeIds(tree)
          const workspaceIds = workspaceIndexFor(ctx.workspaceRegistry.list())
          // spec 09：标题三档（live 投影 → 冷缓存 → 有界折叠兜底），不再整树全日志折叠。
          const treeHeaders = ids
            .map(id => byId.get(id))
            .filter((header): header is SessionHeader => header !== undefined)
          const titles = await titlesFor(ctx, treeHeaders, header => header.id)
          // 子会话标签走官方 subagent 投影（标题单元对种子会话取到父消息，2026-09-02 实测）。
          const childHeaders = treeHeaders.filter(header => header.origin === 'subagent')
          const childLabels = childHeaders.length > 0
            ? await subagentLabels(ctx, childHeaders)
            : new Map<string, string>()
          const nodeOf = (node: SessionTreeNode): Record<string, unknown> => {
            const header = byId.get(node.header.id)
            const sessionId = SessionId(node.header.id)
            const liveSession = ctx.sessions.get(sessionId)
            const agent = ctx.agents.get(sessionId)
            const location = header === undefined ? undefined : assertSessionLocationApi(ctx.sessionPersistence).locate(header)
            const facts = header === undefined ? undefined : sessionFacts(ctx, node.header.id)
            return {
              sessionId: node.header.id,
              title: childLabels.get(node.header.id) ?? titles.get(node.header.id) ?? sessionId,
              updatedAt: header?.createdAt ?? node.header.createdAt,
              createdAt: header?.createdAt ?? node.header.createdAt,
              project: header?.cwd === undefined ? undefined : basename(header.cwd),
              turns: facts?.turns,
              tokens: facts?.decodeTokens,
              lastActiveAt: facts?.lastPromptAt,
              sizeBytes: sizes.get(node.header.id),
              live: liveSession !== undefined,
              running: agent?.status === 'running',
              backendSupported: location !== undefined && sessionDirectoryFor(location) !== undefined,
              workspaceIds: header === undefined ? [] : workspaceIds.get(String(sessionId)) ?? [],
              orphan: header !== undefined && header.origin === 'subagent'
                && header.parentSession !== undefined && !byId.has(String(header.parentSession)),
              children: node.children.map(nodeOf),
            }
          }
          sendJson(res, 200, { tree: tree.map(nodeOf) })
          return
        }

        if (req.method === 'GET' && pathname === `${PREFIX}/strays`) {
          const { headers, sizes } = await headerFacts.get()
          const archivedIds = await readArchivedIds(ctx)
          const attachedIds = ctx.workspaceRegistry.list().flatMap(workspace => workspace.sessionIds.map(id => String(id)))
          // spec 08：有父的子会话跟随父、不单独出现在游离区；孤儿子会话（父不在）按顶层对待并打 orphan 标。
          const children = livingChildIds(headers.map(treeHeaderOf))
          const strayIds = straySessionIds(
            headers.map(header => String(header.id)),
            archivedIds.map(id => String(id)),
            attachedIds,
          ).filter(id => !children.has(id))
          // spec 09：先取游离 header 集，标题/子标签批量三档（缓存优先 + 有界折叠），不再逐会话串行全日志折叠。
          // 审计（host.ts 旧 :1013 的 O(K·S)）：成员判定先建一次 Set，避免逐 header 对 strayIds 做线性 includes。
          const strayIdSet = new Set(strayIds)
          const strayHeaders = headers.filter(header => strayIdSet.has(String(header.id)))
          const titles = await titlesFor(ctx, strayHeaders, header => header.id)
          const labelHeaders = strayHeaders.filter(header => header.origin === 'subagent')
          const childLabels = labelHeaders.length > 0
            ? await subagentLabels(ctx, labelHeaders)
            : new Map<string, string>()
          const items = []
          for (const header of strayHeaders) {
            const sessionId = SessionId(String(header.id))
            const location = assertSessionLocationApi(ctx.sessionPersistence).locate(header)
            const facts = sessionFacts(ctx, String(header.id))
            items.push({
              sessionId: String(header.id),
              title: childLabels.get(String(header.id)) ?? titles.get(String(header.id)) ?? String(sessionId),
              createdAt: header.createdAt,
              project: header.cwd === undefined ? undefined : basename(header.cwd),
              turns: facts?.turns,
              tokens: facts?.decodeTokens,
              lastActiveAt: facts?.lastPromptAt,
              sizeBytes: sizes.get(String(header.id)),
              blank: await readStrayBlankness(ctx, sessionId),
              orphan: header.origin === 'subagent',
              live: ctx.sessions.get(sessionId) !== undefined,
              running: ctx.agents.get(sessionId)?.status === 'running',
              backendSupported: location !== undefined && sessionDirectoryFor(location) !== undefined,
            })
          }
          sendJson(res, 200, { items })
          return
        }

        if (req.method === 'GET' && pathname === `${PREFIX}/trash`) {
          sendJson(res, 200, { items: await listTrashItems(settings.trashRoot) })
          return
        }

        if (req.method === 'GET' && pathname === `${PREFIX}/trash-dir`) {
          // 面板提示信息用：明示回收站实际存放位置（卸载影响可见化）；displayPath 掩码 home 前缀（~）。
          sendJson(res, 200, {
            path: settings.trashRoot,
            displayPath: maskHomePath(settings.trashRoot, homedir()),
          })
          return
        }

        if (req.method === 'POST' && pathname === `${PREFIX}/unarchive`) {
          // 取消归档：官方归档标记的会话回到会话列表原位置（2026-09-01 新增）。
          // 只动归档集、不碰文件——live 会话（被 dsh hold）同样可取消归档；幂等。
          const parsed = bodyObject(await readJsonBody(req), '请求体必须是 JSON 对象')
          if (typeof parsed.sessionId !== 'string' || parsed.sessionId.trim() === '') {
            throw new ArchiveError('BAD_BODY', 'sessionId 必须是非空字符串')
          }
          const sessionId = SessionId(parsed.sessionId)
          await removeArchivedId(surface, sessionId)
          // 补发官方「回到列表」通知（不发则用户刷新页面 → 会话被加载 → hold 守卫拦下后续回收站操作）。
          await emitSessionAdded(ctx, sessionId, headerFacts)
          sendJson(res, 200, { ok: true })
          return
        }

        if (req.method === 'POST' && pathname === `${PREFIX}/archive`) {
          // spec 08：归档以父为单位——父 + 全部有父的子会话一并进归档集（单写链原子）。
          // 只服务游离/孤儿子会话（官方菜单覆盖不到）；官方归档的父由 domain/changed 对齐补子。
          const parsed = bodyObject(await readJsonBody(req), '请求体必须是 JSON 对象')
          if (typeof parsed.sessionId !== 'string' || parsed.sessionId.trim() === '') {
            throw new ArchiveError('BAD_BODY', 'sessionId 必须是非空字符串')
          }
          const rootId = parsed.sessionId.trim()
          const headers = (await headerFacts.get()).headers
          if (!headers.some(header => String(header.id) === rootId)) {
            throw new ArchiveError('UNKNOWN_SESSION', '会话持久化中没有这个会话', 404)
          }
          const subtree = collectSubtreeIds(headers.map(treeHeaderOf), rootId)
          await mutateArchivedSet(surface, ids => {
            const next = new Set(ids.map(String))
            for (const id of subtree) next.add(id)
            return [...next].map(id => SessionId(id))
          })
          sendJson(res, 200, { ok: true, archivedIds: subtree })
          return
        }

        if (req.method === 'POST' && (pathname === `${PREFIX}/trash` || pathname === `${PREFIX}/delete`)) {
          const parsed = bodyObject(await readJsonBody(req), '请求体必须是 JSON 对象')
          if (typeof parsed.sessionId !== 'string' || parsed.sessionId.trim() === '') {
            throw new ArchiveError('BAD_BODY', 'sessionId 必须是非空字符串')
          }
          const sessionId = SessionId(parsed.sessionId)
          const archivedIds = await readArchivedIds(ctx)
          const headers = (await headerFacts.get()).headers
          const attachedIds = ctx.workspaceRegistry.list().flatMap(workspace => workspace.sessionIds.map(id => String(id)))
          const strayIds = straySessionIds(headers.map(header => String(header.id)), archivedIds.map(id => String(id)), attachedIds)
          const isArchived = archivedIds.some(id => String(id) === String(sessionId))
          const isStray = strayIds.includes(String(sessionId))
          if (!isArchived && !isStray) {
            throw new ArchiveError('NOT_ARCHIVED', '只有已归档或游离会话才能移入回收站或删除')
          }
          const live = ctx.sessions.get(sessionId)
          const header = live?.header ?? headers.find(candidate => String(candidate.id) === String(sessionId))
          if (header === undefined) {
            throw new ArchiveError('UNKNOWN_SESSION', '会话持久化中没有这个会话', 404)
          }
          // 宿主真值格式门（请求期，先于任何文件操作）。
          assertHeaderFormatSupported(header)
          const title = await readTitle(ctx, header, header.id)
          const strayBlank = isStray && await readStrayBlankness(ctx, sessionId)
          if (pathname.endsWith('/delete')) {
            if (strayBlank) {
              if (parsed.confirm !== true) {
                throw new ArchiveError('CONFIRMATION_FAILED', '删除空白游离会话需要确认')
              }
            } else if (!isDeleteConfirmationSufficient(title, parsed.confirmTitle)) {
              throw new ArchiveError('CONFIRMATION_FAILED', '删除确认失败：请输入完整会话标题')
            }
          } else if (parsed.confirm !== true) {
            throw new ArchiveError('CONFIRMATION_FAILED', '移入回收站需要二次确认')
          }

          const workspaces = workspaceIndexFor(ctx.workspaceRegistry.list()).get(String(sessionId)) ?? []
          ensureSessionNotLive(ctx, sessionId)
          const location = assertSessionLocationApi(ctx.sessionPersistence).locate(header)
          const sessionDir = location === undefined ? undefined : sessionDirectoryFor(location)
          if (sessionDir === undefined) {
            throw new ArchiveError('BACKEND_UNSUPPORTED', '当前会话持久化后端不提供已知的单会话目录，无法移入回收站/删除', 501)
          }

          const subagents = await listSubagentTargets(ctx, sessionId, headerFacts)
          // 随父一起搬走/删掉的**全部后代**子会话 id（归档集清理与响应契约共用）。
          const subagentIds = subagents.map(child => String(child.sessionId))

          if (pathname.endsWith('/trash')) {
            await ensureTrashRoot(settings.trashRoot)
            const trashId = `${sanitizeSegment(String(sessionId))}-${Date.now()}`
            const trashDir = resolveTrashDir(settings.trashRoot, trashId)
            const moved: Array<{ from: string; to: string }> = []
            const rollbackMoves = async (): Promise<void> => {
              for (const move of [...moved].reverse()) {
                try {
                  await rename(move.to, move.from)
                } catch (rollbackError) {
                  ctx.logger.warn(`dsh-archive-manage: 回滚失败（${move.to} → ${move.from}）：${String(rollbackError)}`)
                }
              }
            }
            try {
              await rename(sessionDir, trashDir)
              moved.push({ from: sessionDir, to: trashDir })
            } catch (error) {
              throw new ArchiveError('IO_ERROR', `移动父会话目录失败：${error instanceof Error ? error.message : String(error)}`, 500)
            }
            const subagentSidecars: ArchiveSubagentSidecar[] = []
            if (subagents.length > 0) {
              const subagentsDir = join(trashDir, 'subagents')
              const workspaceIds = workspaceIndexFor(ctx.workspaceRegistry.list())
              try {
                await mkdir(subagentsDir, { recursive: true })
                for (const child of subagents) {
                  const childDirName = safeDirName(basename(child.dir))
                  const to = join(subagentsDir, childDirName)
                  try {
                    await rename(child.dir, to)
                  } catch (error) {
                    // ENOENT = 目录本就不在磁盘上（陈旧 header 缓存 / 手工删过）：没有东西可搬，
                    // 跳过并继续——与 delete 分支的 ENOENT 口径一致（审计 F2），不让一个幽灵条目把
                    // 整单拖回滚、把用户永久卡在「这个树移不进回收站」。它仍留在响应/归档集清理清单里
                    // （磁盘上已无该会话，标记不该留）。其余错误照旧整单回滚。
                    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
                      ctx.logger.warn(`dsh-archive-manage: subagent 会话目录不在磁盘上（${String(child.sessionId)}），已跳过搬运：${error instanceof Error ? error.message : String(error)}`)
                      continue
                    }
                    throw error
                  }
                  moved.push({ from: child.dir, to })
                  subagentSidecars.push({
                    sessionId: String(child.sessionId),
                    title: await readTitle(ctx, child.header, child.header.id),
                    originalPath: child.dir,
                    workspaceIds: workspaceIds.get(String(child.sessionId)) ?? [],
                  })
                }
              } catch (error) {
                await rollbackMoves()
                // 回滚成功后 trashDir 已移回原处，清掉残留的空 subagents/ 子目录（非空时保留，避免误删未移回的会话）。
                await rmdir(join(sessionDir, 'subagents')).catch(() => undefined)
                throw new ArchiveError('IO_ERROR', `移动 subagent 会话目录失败（已回滚）：${error instanceof Error ? error.message : String(error)}`, 500)
              }
            }
            const sidecar = {
              version: 2,
              sessionId: String(sessionId),
              title,
              originalPath: sessionDir,
              archivedAt: new Date().toISOString(),
              workspaceIds: workspaces,
              subagents: subagentSidecars.length > 0 ? subagentSidecars : undefined,
            }
            try {
              await writeFile(join(trashDir, TRASH_SIDECAR), JSON.stringify(sidecar, null, 2), 'utf8')
            } catch (error) {
              await rollbackMoves()
              await rmdir(join(sessionDir, 'subagents')).catch(() => undefined)
              throw new ArchiveError('IO_ERROR', `写入回收站 sidecar 失败（已回滚）：${error instanceof Error ? error.message : String(error)}`, 500)
            }
            // 工作区记账 detach 是 best-effort：会话目录已移走，官方 workspace 投影对缺失 header 的
            // 候选自动过滤、下次工作区变更时 durable 修剪（rc.1 Workspace.sessionIds 契约），失败可自愈。
            try {
              await detachWorkspaceAccounting(ctx, sessionId)
            } catch (cleanupError) {
              ctx.logger.warn(`dsh-archive-manage: 工作区记账清理失败（${String(sessionId)}）：${String(cleanupError)}`)
            }
            for (const child of subagents) {
              try {
                await detachWorkspaceAccounting(ctx, child.sessionId)
              } catch (cleanupError) {
                ctx.logger.warn(`dsh-archive-manage: subagent 工作区记账清理失败（${String(child.sessionId)}）：${String(cleanupError)}`)
              }
            }
            try {
              await removeArchivedIds(surface, archivedIdsToRemove(String(sessionId), subagentIds))
            } catch (cleanupError) {
              ctx.logger.warn(`dsh-archive-manage: 归档集清理失败：${String(cleanupError)}`)
            }
            // 移入回收站不失效投影行：会话身份未变，还原后标题投影依然有效（否则子会话标题退化为
            // 冷读首条用户消息 = 委派指令文本；2026-09-02 实测，spec 08 §2.6）。
            // 通知会话列表消费者移除条目（官方公开事件；会话目录已移走）。
            ctx.emit('api-session/removed', sessionId)
            for (const child of subagents) {
              ctx.emit('api-session/removed', child.sessionId)
            }
            sendJson(res, 200, {
              ok: true,
              trashId,
              workspaceIds: workspaces,
              subagentIds,
            })
            return
          }

          await rm(sessionDir, { recursive: true, force: false })
          // 只有真正从磁盘上消失的子会话（含全部后代）才算 removed：rm 失败者仍在磁盘上，保留其归档标记
          // 与工作区记账，让它在归档面板以孤儿根继续可操作（审计 S7）。
          const deletedSubagentIds: string[] = []
          for (const child of subagents) {
            try {
              // force:true 只吞 ENOENT——目录本就不在磁盘上同样算「已消失」，否则它会被
              // 当成「失败、仍在磁盘上」而永久保留归档标记，成为再也删不掉的孤儿根
              // （父目录已删，再点删除会在上面那行 rm 上整单失败）。其余错误照旧抛出、保留标记。
              await rm(child.dir, { recursive: true, force: true })
              deletedSubagentIds.push(String(child.sessionId))
            } catch (error) {
              ctx.logger.warn(`dsh-archive-manage: 删除 subagent 会话目录失败（${String(child.sessionId)}），属 best-effort 清理、已跳过并保留归档标记：${error instanceof Error ? error.message : String(error)}`)
            }
          }
          const deletedSubagentIdSet = new Set(deletedSubagentIds)
          // 工作区记账 detach 是 best-effort（同移入回收站：官方过滤投影 + 下次变更修剪自愈）。
          try {
            await detachWorkspaceAccounting(ctx, sessionId)
          } catch (cleanupError) {
            ctx.logger.warn(`dsh-archive-manage: 工作区记账清理失败（${String(sessionId)}）：${String(cleanupError)}`)
          }
          for (const child of subagents) {
            if (!deletedSubagentIdSet.has(String(child.sessionId))) continue
            try {
              await detachWorkspaceAccounting(ctx, child.sessionId)
            } catch (cleanupError) {
              ctx.logger.warn(`dsh-archive-manage: subagent 工作区记账清理失败（${String(child.sessionId)}）：${String(cleanupError)}`)
            }
          }
          try {
            await removeArchivedIds(surface, archivedIdsToRemove(String(sessionId), deletedSubagentIds))
          } catch (cleanupError) {
            ctx.logger.warn(`dsh-archive-manage: 归档集清理失败：${String(cleanupError)}`)
          }
          await invalidateProjectionCacheGuarded(ctx, sessionId)
          for (const child of subagents) {
            if (!deletedSubagentIdSet.has(String(child.sessionId))) continue
            await invalidateProjectionCacheGuarded(ctx, child.sessionId)
          }
          // 通知会话列表消费者移除条目（官方公开事件；会话目录已删除）。
          ctx.emit('api-session/removed', sessionId)
          for (const child of subagents) {
            if (!deletedSubagentIdSet.has(String(child.sessionId))) continue
            ctx.emit('api-session/removed', child.sessionId)
          }
          sendJson(res, 200, { ok: true, deleted: true, workspaceIds: workspaces, subagentIds: deletedSubagentIds })
          return
        }

        if (req.method === 'POST' && pathname === `${PREFIX}/trash-delete`) {
          const parsed = bodyObject(await readJsonBody(req), '请求体必须是 JSON 对象')
          if (typeof parsed.trashId !== 'string' || parsed.trashId.trim() === '') {
            throw new ArchiveError('BAD_BODY', 'trashId 必须是非空字符串')
          }
          if (parsed.confirm !== true) {
            throw new ArchiveError('CONFIRMATION_FAILED', '彻底删除回收站条目需要二次确认')
          }
          const trashDir = resolveTrashDir(settings.trashRoot, parsed.trashId)
          let info
          try {
            info = await stat(trashDir)
          } catch {
            throw new ArchiveError('UNKNOWN_TRASH', '回收站条目不存在', 404)
          }
          if (!info.isDirectory()) {
            throw new ArchiveError('UNKNOWN_TRASH', '回收站 id 不是目录', 404)
          }
          await rm(trashDir, { recursive: true, force: false })
          sendJson(res, 200, { ok: true, trashId: parsed.trashId })
          return
        }

        if (req.method === 'POST' && pathname === `${PREFIX}/restore`) {
          const parsed = bodyObject(await readJsonBody(req), '请求体必须是 JSON 对象')
          if (typeof parsed.trashId !== 'string' || parsed.trashId.trim() === '') {
            throw new ArchiveError('BAD_BODY', 'trashId 必须是非空字符串')
          }
          const trashDir = resolveTrashDir(settings.trashRoot, parsed.trashId)
          const sidecar = await restoreTrashDir(ctx, surface, trashDir)
          // 还原把会话目录移回持久化：立即失效 header 缓存（restore 不发 added 事件，写穿靠这里）。
          headerFacts.invalidate()
          sendJson(res, 200, { ok: true, sessionId: sidecar.sessionId, workspaceIds: sidecar.workspaceIds })
          return
        }

        if (req.method === 'POST' && pathname === `${PREFIX}/trash-restore-all`) {
          const parsed = bodyObject(await readJsonBody(req), '请求体必须是 JSON 对象')
          if (parsed.confirm !== true) {
            throw new ArchiveError('CONFIRMATION_FAILED', '还原全部回收站条目需要二次确认')
          }
          const names = await trashDirNames(settings.trashRoot)
          const restored: string[] = []
          const failed: Array<{ trashId: string; message: string }> = []
          let skippedLegacy = 0
          for (const name of names) {
            const dir = resolveTrashDir(settings.trashRoot, name)
            try {
              const sidecar = await restoreTrashDir(ctx, surface, dir)
              restored.push(sidecar.sessionId)
            } catch (error) {
              if (error instanceof ArchiveError && error.code === 'UNKNOWN_TRASH') {
                skippedLegacy += 1
                continue
              }
              failed.push({ trashId: name, message: error instanceof Error ? error.message : String(error) })
            }
          }
          headerFacts.invalidate()
          sendJson(res, 200, { ok: true, restored, skippedLegacy, failed })
          return
        }

        if (req.method === 'POST' && pathname === `${PREFIX}/trash-delete-all`) {
          const parsed = bodyObject(await readJsonBody(req), '请求体必须是 JSON 对象')
          if (parsed.confirm !== true) {
            throw new ArchiveError('CONFIRMATION_FAILED', '彻底删除全部回收站条目需要二次确认')
          }
          const names = await trashDirNames(settings.trashRoot)
          const failed: string[] = []
          let deleted = 0
          for (const name of names) {
            try {
              const dir = resolveTrashDir(settings.trashRoot, name)
              const info = await stat(dir)
              if (info.isDirectory()) {
                await rm(dir, { recursive: true, force: false })
                deleted += 1
              }
            } catch {
              failed.push(name)
            }
          }
          sendJson(res, 200, { ok: true, deleted, failed })
          return
        }

        sendJson(res, 404, { error: { code: 'BAD_BODY', message: `未知的 archive-manage 路由：${pathname}` } })
      } catch (error) {
        sendError(res, error)
      }
    },
  }), 'dsh-archive-manage: REST routes')
}
