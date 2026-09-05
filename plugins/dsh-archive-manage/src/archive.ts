/** dsh-archive-manage 纯逻辑：配置、确认强度、回收站目录、sidecar 解析。 */

import { join } from 'node:path'

export const TRASH_SIDECAR = 'dsh-archive-manage.json'
/** 回收站目录名（. 前缀与 DSH 官方目录区分）。 */
export const DEFAULT_TRASH_DIR = '.sessions-trash'

export interface ArchiveConfig {
  readonly trashRoot: string
}

export interface ArchiveSubagentSidecar {
  readonly sessionId: string
  readonly title: string
  readonly originalPath: string
  readonly workspaceIds: readonly string[]
}

export interface ArchiveSidecar {
  readonly version: 1 | 2
  readonly sessionId: string
  readonly title: string
  readonly originalPath: string
  readonly archivedAt: string
  readonly workspaceIds: readonly string[]
  /** version 2：移入回收站时随父会话一起移动的 subagent 会话。 */
  readonly subagents?: readonly ArchiveSubagentSidecar[]
}

/** DSH 数据主目录（$DSH_HOME 优先，缺省 ~/.dsh）。 */
function dshHomeBase(): string {
  const fallbackHome = join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh')
  return process.env.DSH_HOME?.trim() || fallbackHome
}

/** 默认回收站目录的绝对路径。 */
export function defaultTrashDir(): string {
  return join(dshHomeBase(), DEFAULT_TRASH_DIR)
}

export function normalizeArchiveConfig(input: Readonly<Partial<ArchiveConfig>> | undefined): ArchiveConfig {
  const trash = input?.trashRoot?.trim()
  if (trash !== undefined && trash === '') throw new Error('dsh-archive-manage: trashRoot 不能为空')
  return { trashRoot: trash || defaultTrashDir() }
}

/** 彻底删除强确认：用户输入必须与会话当前标题逐字一致（trim 后比较）。 */
export function isDeleteConfirmationSufficient(expectedTitle: string, input: unknown): boolean {
  return typeof input === 'string' && input.trim() === expectedTitle.trim() && expectedTitle.trim() !== ''
}

/** 回收站目录 / 回收站 id 只允许大小写字母、数字、- 和 _，避免路径穿越。 */
export function sanitizeSegment(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9_-]/gu, '_')
  return /[A-Za-z0-9]/u.test(safe) ? safe : 'unknown'
}

/**
 * 官方 jsonl 后端单会话目录名的安全判定（rc.1 布局 `<root>/<project>/<encodeSegment(id)>/`）：
 * - 普通形式：大小写字母、数字、-、_（官方生成的会话 id 为 UUID / session-<uuid> / webhook-<uuid>，直接落盘）；
 * - 官方 encodeSegment 转义形式：`~XXXX`（4 位大写十六进制）穿插在 `[A-Za-z0-9._-]` 之间
 *   （外部注入的任意会话 id——如 ACP——会被官方转义成该形式）。
 * 两种形式都不含路径分隔符与盘符冒号；`.`、`..`、空串一律拒绝（`.` 会命中转义形式字符集，须显式排除）。
 */
export function isSafeSessionDirName(name: string): boolean {
  if (name === '' || name === '.' || name === '..') return false
  return /^(?:[A-Za-z0-9._-]|~[0-9A-F]{4})+$/u.test(name)
}

/**
 * 把 home 目录前缀掩码为 `~`（跨平台）：Windows 反斜杠与 POSIX 斜杠都处理；
 * 先精确匹配，再回退大小写不敏感匹配（Windows 大小写不敏感的盘符路径）。
 * 不在 home 下的路径原样返回。
 */
export function maskHomePath(path: string, homeDir: string): string {
  const home = homeDir.replace(/[\\/]+$/u, '')
  if (home === '') return path
  const hasPrefix = (candidate: string, prefix: string): boolean =>
    candidate === prefix || candidate.startsWith(`${prefix}\\`) || candidate.startsWith(`${prefix}/`)
  if (hasPrefix(path, home)) return `~${path.slice(home.length)}`
  if (hasPrefix(path.toLowerCase(), home.toLowerCase())) return `~${path.slice(home.length)}`
  return path
}

/** 从回收站 sidecar 解析出安全的还原信息；非法输入返回 undefined。 */
export function parseTrashSidecar(value: unknown): ArchiveSidecar | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const sidecar = value as Record<string, unknown>
  if (sidecar.version !== 1 && sidecar.version !== 2) return undefined
  if (typeof sidecar.sessionId !== 'string' || sidecar.sessionId.trim() === '') return undefined
  if (typeof sidecar.originalPath !== 'string' || sidecar.originalPath.trim() === '') return undefined
  if (typeof sidecar.archivedAt !== 'string') return undefined
  if (!Array.isArray(sidecar.workspaceIds) || !sidecar.workspaceIds.every(id => typeof id === 'string')) return undefined
  let subagents: ArchiveSubagentSidecar[] | undefined
  if (sidecar.version === 2 && sidecar.subagents !== undefined) {
    if (!Array.isArray(sidecar.subagents)) return undefined
    subagents = sidecar.subagents.map((item): ArchiveSubagentSidecar | undefined => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) return undefined
      const child = item as Record<string, unknown>
      if (typeof child.sessionId !== 'string' || child.sessionId.trim() === '') return undefined
      if (typeof child.originalPath !== 'string' || child.originalPath.trim() === '') return undefined
      if (!Array.isArray(child.workspaceIds) || !child.workspaceIds.every(id => typeof id === 'string')) return undefined
      return {
        sessionId: child.sessionId,
        title: typeof child.title === 'string' ? child.title : child.sessionId,
        originalPath: child.originalPath,
        workspaceIds: child.workspaceIds,
      }
    }).filter((item): item is ArchiveSubagentSidecar => item !== undefined)
    if (subagents.length !== (sidecar.subagents as unknown[]).length) return undefined
  }
  return {
    version: sidecar.version,
    sessionId: sidecar.sessionId,
    title: typeof sidecar.title === 'string' ? sidecar.title : sidecar.sessionId,
    originalPath: sidecar.originalPath,
    archivedAt: sidecar.archivedAt,
    workspaceIds: sidecar.workspaceIds,
    subagents,
  }
}

/** 旧格式条目（无 sidecar）：目录名即会话 id；只可列出/彻底删除，不可还原。 */
export interface LegacyTrashItem {
  readonly trashId: string
  readonly sessionId: string
  readonly title: string
  readonly archivedAt: string
  readonly workspaceIds: readonly []
  readonly legacy: true
}

/** 回收站条目视图（列表接口返回形状）：子会话仅展示用（父子联动），
 *  还原/删除整棵走 sidecar 原样。 */
export interface TrashItemView {
  readonly trashId: string
  readonly sessionId: string
  readonly title: string
  readonly archivedAt: string
  readonly workspaceIds: readonly string[]
  readonly legacy: false
  readonly subagents: ReadonlyArray<{ sessionId: string; title: string }>
}

/** sidecar → 列表条目视图；v1 无子会话记录时 subagents 为空数组。 */
export function trashItemView(trashId: string, sidecar: ArchiveSidecar): TrashItemView {
  return {
    trashId,
    sessionId: sidecar.sessionId,
    title: sidecar.title,
    archivedAt: sidecar.archivedAt,
    workspaceIds: sidecar.workspaceIds,
    legacy: false,
    subagents: (sidecar.subagents ?? []).map(child => ({ sessionId: child.sessionId, title: child.title })),
  }
}

/**
 * 从旧格式目录构造列表条目；时间取目录 mtime。
 * @param name - 回收站目录名（旧格式下即会话 id）。
 * @param mtimeMs - 目录最后修改时间（毫秒时间戳）。
 */
export function legacyTrashItem(name: string, mtimeMs: number): LegacyTrashItem {
  return {
    trashId: name,
    sessionId: name,
    title: name,
    archivedAt: new Date(mtimeMs).toISOString(),
    workspaceIds: [],
    legacy: true,
  }
}

/**
 * 游离会话识别（三差集，见 docs/spec/05-stray-sessions.md）：
 * 持久化清单里有 ∧ 不在归档集 ∧ 不挂任何工作区。保持输入顺序。
 * @param persistedIds - sessionPersistence.list() 的会话 id。
 * @param archivedIds - workspace 域 archivedSessionIds。
 * @param attachedIds - 所有 workspace.sessionIds 的并集。
 */
export function straySessionIds(
  persistedIds: readonly string[],
  archivedIds: readonly string[],
  attachedIds: readonly string[],
): string[] {
  const archived = new Set(archivedIds)
  const attached = new Set(attachedIds)
  return persistedIds.filter(id => !archived.has(id) && !attached.has(id))
}

/**
 * 从官方投影行解析「空白会话」信号（session_projcache 行形状：{ version, record: { identity, rows } }）：
 * blank = sessionListMetadata.blank === true 或 sessionStats.turns === 0。
 * 行缺失 / 形状异常 / 明确非空白一律返回 undefined（调用方按非空白保守对待）。
 */
export function parseBlankProjection(row: unknown): { blank: true } | undefined {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) return undefined
  const outer = row as Record<string, unknown>
  const recordCandidate = outer.record
  const record = (typeof recordCandidate === 'object' && recordCandidate !== null && !Array.isArray(recordCandidate)
    ? recordCandidate
    : outer) as Record<string, unknown>
  const rowsCandidate = record.rows
  if (typeof rowsCandidate !== 'object' || rowsCandidate === null || Array.isArray(rowsCandidate)) return undefined
  const rows = rowsCandidate as Record<string, unknown>
  const metaVal = (rows.sessionListMetadata as Record<string, unknown> | undefined)?.val
  const statsVal = (rows.sessionStats as Record<string, unknown> | undefined)?.val
  const metaBlank = (metaVal as Record<string, unknown> | undefined)?.blank
  const statsTurns = (statsVal as Record<string, unknown> | undefined)?.turns
  if (metaBlank === true || statsTurns === 0) return { blank: true }
  return undefined
}

/** 会话统计与列表元数据（展示用；v5/v6 双形状，与 parseBlankProjection 同款 record ?? outer 回退）。 */
export interface SessionFacts {
  readonly turns?: number
  readonly decodeTokens?: number
  readonly lastPromptAt?: number
}

export function parseSessionFacts(row: unknown): SessionFacts | undefined {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) return undefined
  const outer = row as Record<string, unknown>
  const recordCandidate = outer.record
  const record = (typeof recordCandidate === 'object' && recordCandidate !== null && !Array.isArray(recordCandidate)
    ? recordCandidate
    : outer) as Record<string, unknown>
  const rowsCandidate = record.rows
  if (typeof rowsCandidate !== 'object' || rowsCandidate === null || Array.isArray(rowsCandidate)) return undefined
  const rows = rowsCandidate as Record<string, unknown>
  const statsVal = (rows.sessionStats as Record<string, unknown> | undefined)?.val as Record<string, unknown> | undefined
  const metaVal = (rows.sessionListMetadata as Record<string, unknown> | undefined)?.val as Record<string, unknown> | undefined
  const turns = typeof statsVal?.turns === 'number' ? statsVal.turns : undefined
  const decodeTokens = typeof statsVal?.decodeTokens === 'number' ? statsVal.decodeTokens : undefined
  const lastPromptAt = typeof metaVal?.lastPromptAt === 'number' ? metaVal.lastPromptAt : undefined
  if (turns === undefined && decodeTokens === undefined && lastPromptAt === undefined) return undefined
  const facts: SessionFacts = {
    ...(turns === undefined ? {} : { turns }),
    ...(decodeTokens === undefined ? {} : { decodeTokens }),
    ...(lastPromptAt === undefined ? {} : { lastPromptAt }),
  }
  return facts
}

/** 树构建所需的 SessionHeader 结构子集（纯模块零依赖，host 侧传入真实 header）。 */
export interface SessionTreeHeader {
  readonly id: string
  readonly createdAt: number
  readonly parentSession?: string
  readonly origin?: 'subagent'
}

export interface SessionTreeNode {
  readonly header: SessionTreeHeader
  readonly children: SessionTreeNode[]
}

/**
 * 由全量会话 header 构建父子树：
 * - 子会话（origin === 'subagent' 且父在清单内）挂到父节点下，同级按 createdAt 升序；
 * - 顶层会话与孤儿子会话（父不在清单内）为根节点，按 createdAt 降序；
 * - 孤儿按顶层会话对待（无父可随，面板手动操作；spec 08）。
 */
export function buildSessionTree(headers: readonly SessionTreeHeader[]): SessionTreeNode[] {
  const byId = new Map(headers.map(header => [header.id, header]))
  const childrenOf = new Map<string, SessionTreeHeader[]>()
  const claimed = new Set<string>()
  for (const header of headers) {
    if (header.origin !== 'subagent' || header.parentSession === undefined) continue
    if (!byId.has(header.parentSession)) continue
    claimed.add(header.id)
    const list = childrenOf.get(header.parentSession) ?? []
    list.push(header)
    childrenOf.set(header.parentSession, list)
  }
  const build = (header: SessionTreeHeader): SessionTreeNode => {
    const childHeaders = (childrenOf.get(header.id) ?? []).sort((a, b) => a.createdAt - b.createdAt)
    return { header, children: childHeaders.map(build) }
  }
  return headers
    .filter(header => !claimed.has(header.id))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(build)
}

export interface ArchiveAlignment {
  readonly add: string[]
  readonly remove: string[]
}

/**
 * 计算父子归档对齐差异（spec 08 状态不变量：子镜像父）：
 * - 父已归档而子未归档 → 加入 add；
 * - 父未归档而子已归档 → 加入 remove；
 * - 孤儿子会话（父不在清单）与顶层会话不参与。
 */
export function archiveAlignmentForChildren(
  headers: readonly SessionTreeHeader[],
  archivedIds: readonly string[],
): ArchiveAlignment {
  const byId = new Map(headers.map(header => [header.id, header]))
  const archived = new Set(archivedIds)
  const add: string[] = []
  const remove: string[] = []
  for (const header of headers) {
    if (header.origin !== 'subagent' || header.parentSession === undefined) continue
    if (!byId.has(header.parentSession)) continue
    const parentArchived = archived.has(header.parentSession)
    const childArchived = archived.has(header.id)
    if (parentArchived && !childArchived) add.push(header.id)
    else if (!parentArchived && childArchived) remove.push(header.id)
  }
  return { add, remove }
}

/** 有父（父在清单内）的子会话 id 集合——这些子会话跟随父，不单独出现在游离区（spec 08）。 */
export function livingChildIds(headers: readonly SessionTreeHeader[]): Set<string> {
  const byId = new Set(headers.map(header => header.id))
  const out = new Set<string>()
  for (const header of headers) {
    if (header.origin !== 'subagent' || header.parentSession === undefined) continue
    if (byId.has(header.parentSession)) out.add(header.id)
  }
  return out
}

/** 根会话及其全部后代 id（按父为单位归档/取消归档时使用；BFS 保序）。 */
export function collectSubtreeIds(headers: readonly SessionTreeHeader[], rootId: string): string[] {
  const childrenOf = new Map<string, string[]>()
  const byId = new Set(headers.map(header => header.id))
  for (const header of headers) {
    if (header.origin !== 'subagent' || header.parentSession === undefined) continue
    if (!byId.has(header.parentSession)) continue
    const list = childrenOf.get(header.parentSession) ?? []
    list.push(header.id)
    childrenOf.set(header.parentSession, list)
  }
  const out: string[] = [rootId]
  for (let i = 0; i < out.length; i++) out.push(...(childrenOf.get(out[i]) ?? []))
  return out
}

/**
 * header 事实缓存存储（spec 09，纯逻辑供单测）：TTL 内直接返回缓存；过期后
 * 单飞填充（并发调用共享同一 promise）；invalidate 清缓存让下一次 get 重扫。
 * 安全依据：jsonl header 物化后不可变，按 id 缓存只需处理成员增减（写穿失效）。
 */
export interface HeaderFactsStore<F> {
  get(): Promise<F>
  invalidate(): void
}

export function createHeaderFactsStore<F>(
  load: () => Promise<F>,
  ttlMs: number,
  now: () => number = Date.now,
): HeaderFactsStore<F> {
  let cached: F | undefined
  let fetchedAt = -Infinity
  let inflight: Promise<F> | undefined
  return {
    async get(): Promise<F> {
      if (cached !== undefined && now() - fetchedAt < ttlMs) return cached
      inflight ??= load().then(value => {
        cached = value
        fetchedAt = now()
        return value
      }).finally(() => {
        inflight = undefined
      })
      return inflight
    },
    invalidate(): void {
      cached = undefined
      fetchedAt = -Infinity
    },
  }
}

/**
 * 有界并发执行（spec 09，纯逻辑供单测）：至多 limit 个 worker 顺序取任务；
 * 单任务失败只在该位置记 undefined，不中断其余任务；结果与输入对齐。
 */
export async function runBounded<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<Array<R | undefined>> {
  const results: Array<R | undefined> = new Array<R | undefined>(items.length)
  if (items.length === 0) return results
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const index = next
      next += 1
      if (index >= items.length) return
      const item = items[index] as T
      try {
        results[index] = await work(item)
      } catch {
        results[index] = undefined
      }
    }
  })
  await Promise.all(workers)
  return results
}

