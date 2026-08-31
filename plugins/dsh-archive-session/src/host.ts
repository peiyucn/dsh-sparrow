/** dsh-archive-session host half：标题缓存 + 归档会话 REST 路由。 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdir, readdir, readFile, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { SessionId, type SessionHeader } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { SessionTitleObservationResult } from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-storage-domain'
import { WorkspaceId, workspaceDomainSpec } from '@deepseek-ai/dsh-workspace'
import type { Workspace } from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-workspace'
import {
  BACKUP_SIDECAR, isDeleteConfirmationSufficient, legacyBackupItem, maskHomePath, normalizeArchiveConfig,
  parseBackupSidecar, parseBlankProjection, sanitizeSegment, straySessionIds,
  type ArchiveConfig, type ArchiveSidecar, type ArchiveSubagentSidecar,
} from './archive.js'

export const name = 'dsh-archive-session'
export const inject = ['webServer', 'sessions', 'agents', 'workspaceRegistry', 'sessionPersistence', 'sessionQuery', 'storageDomain']

export type { ArchiveConfig }

const PREFIX = '/api/archive-session'
const MAX_BODY_BYTES = 64 * 1024

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * 官方 session-controller 公开事件（@mode emit，见 dsh-api-session-controller types.ts）：
     * 会话离开宿主时客户端会话列表据此即时移除条目。备份/删除成功后会话目录已移走，
     * 补发此事件让侧边栏「未分组」等列表立即同步（2026-08-30 修复残留条目）。
     */
    'api-session/removed'(sessionId: SessionId): void
  }
}

type ArchiveErrorCode =
  | 'BAD_BODY'
  | 'NOT_ARCHIVED'
  | 'UNKNOWN_SESSION'
  | 'UNKNOWN_BACKUP'
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
  // 原生 fs 错误消息可能含绝对路径：掩码 home 前缀，与 /backup-dir 的展示口径一致。
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

/** 找出仍持该会话的工作区，供备份 sidecar / 恢复时反向记账。 */
function workspaceIdsFor(workspaces: readonly Workspace[], sessionId: SessionId): string[] {
  return workspaces
    .filter(workspace => workspace.sessionIds.includes(sessionId))
    .map(workspace => String(workspace.id))
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
    throw new ArchiveError('SESSION_LIVE', '该会话正在生成回复：请先停止生成后再备份', 409)
  }
  if (agent !== undefined || ctx.sessions.get(sessionId) !== undefined) {
    throw new ArchiveError(
      'SESSION_LIVE',
      '该会话仍被 dsh 进程占用（未释放），运行期间无法安全移动其文件：请在下次启动 dsh 后重试',
      409,
    )
  }
}

/** 官方投影缓存域（session_projcache）：备份/删除移走目录后失效对应行，@ 列表不再读到。 */
const PROJCACHE_DOMAIN_NAME = 'session_projcache'
const PROJCACHE_SESSIONS_TABLE = 'sessions'

async function readTitle(ctx: Context, sessionId: SessionId, fallback: string): Promise<string> {
  const observations = await ctx.sessionQuery.readTitleSnapshots([sessionId])
  return titleFromObservation(observations[0], fallback)
}

async function ensureBackupRoot(backupRoot: string): Promise<void> {
  try {
    await mkdir(backupRoot, { recursive: true })
  } catch (error) {
    throw new ArchiveError('IO_ERROR', `无法创建备份目录：${error instanceof Error ? error.message : String(error)}`, 500)
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

/** 归档集域句柄的最小面：global 读写 archivedSessionIds。 */
interface ArchivedDomainHandle {
  readonly global: {
    get(): { readonly archivedSessionIds: readonly SessionId[] }
    set(value: { readonly archivedSessionIds: readonly SessionId[] }): Promise<void>
  }
}

/**
 * 取归档集所在域（workspace 域由官方 WorkspaceRegistry 常驻打开，
 * 直接 get；未打开时 open 兜底）。此前一律 open 会撞 already-open
 * 被 catch 吞掉，归档集更新静默失败——@ 列表直到重启才消失的根因。
 */
async function openWorkspaceDomain(ctx: Context): Promise<ArchivedDomainHandle> {
  const existing = ctx.storageDomain.get(workspaceDomainSpec.name)
  if (existing !== undefined) return existing as unknown as ArchivedDomainHandle
  return await ctx.storageDomain.open(workspaceDomainSpec) as unknown as ArchivedDomainHandle
}

/**
 * 域写串行化：归档集的 get→set 是非原子读改写，并发备份/恢复会互相覆盖丢失更新
 * （2026-08-30 审计）。串行后每次 set 都基于最新域状态。
 */
let domainWriteTail: Promise<unknown> = Promise.resolve()
function serializeDomainWrite<T>(operation: () => Promise<T>): Promise<T> {
  const next = domainWriteTail.then(operation, operation)
  domainWriteTail = next.catch(() => undefined)
  return next
}

/** 读归档集（以域为准：官方 WorkspaceRegistry 内存态不订阅域变更，直写后会陈旧）。 */
async function readArchivedIds(ctx: Context): Promise<SessionId[]> {
  const domain = await openWorkspaceDomain(ctx)
  return [...domain.global.get().archivedSessionIds]
}

/** 直写后一致性检查：registry 内存态与域不一致时告警（官方下一次写会把已移除 id 复活为幽灵条目）。 */
function warnIfRegistryStale(ctx: Context, domain: ArchivedDomainHandle, label: string): void {
  try {
    const registry = ctx.workspaceRegistry.archivedSessionIds.map(String).sort()
    const domainIds = domain.global.get().archivedSessionIds.map(String).sort()
    if (registry.join(',') !== domainIds.join(',')) {
      ctx.logger.warn(`dsh-archive-session: ${label} 后官方 workspace 内存态与域不一致；官方后续写操作可能把已移除会话 id 复活（重启后启动清扫恢复）`)
    }
  } catch {
    // 一致性检查只作告警，不参与主流程。
  }
}

/** 经公开 storageDomain 从归档集中移除会话；域变更经 workspace-controller 的 {type:'archived'} follow 帧同步客户端。 */
async function removeArchivedId(ctx: Context, sessionId: SessionId): Promise<void> {
  await serializeDomainWrite(async () => {
    const domain = await openWorkspaceDomain(ctx)
    const state = domain.global.get()
    const archivedSessionIds = state.archivedSessionIds.filter(id => String(id) !== String(sessionId))
    if (archivedSessionIds.length === state.archivedSessionIds.length) return
    await domain.global.set({ ...state, archivedSessionIds })
    warnIfRegistryStale(ctx, domain, 'removeArchivedId')
  })
}

/** 恢复时把会话加回归档集，并让 WorkspaceRegistry 的内存态也回到一致。 */
async function addArchivedId(ctx: Context, sessionId: SessionId): Promise<void> {
  await serializeDomainWrite(async () => {
    const domain = await openWorkspaceDomain(ctx)
    const state = domain.global.get()
    if (!state.archivedSessionIds.some(id => String(id) === String(sessionId))) {
      await domain.global.set({ ...state, archivedSessionIds: [...state.archivedSessionIds, sessionId] })
    }
  })
  await ctx.workspaceRegistry.archiveSession(sessionId)
}

/**
 * 启动清扫：归档集里不在持久化中的幽灵 id（官方写操作复活产物）清理掉，
 * 否则它们会永久驻留（2026-08-30 审计发现的 registry 缓存陈旧问题）。
 */
async function sweepGhostArchivedIds(ctx: Context): Promise<void> {
  try {
    const domain = await openWorkspaceDomain(ctx)
    const headers = await ctx.sessionPersistence.list()
    const known = new Set(headers.map(header => String(header.id)))
    await serializeDomainWrite(async () => {
      const latest = domain.global.get()
      const cleaned = latest.archivedSessionIds.filter(id => known.has(String(id)))
      if (cleaned.length === latest.archivedSessionIds.length) return
      await domain.global.set({ ...latest, archivedSessionIds: cleaned })
      ctx.logger.warn(`dsh-archive-session: 启动清扫移除 ${latest.archivedSessionIds.length - cleaned.length} 个幽灵归档 id`)
    })
  } catch (error) {
    ctx.logger.warn(`dsh-archive-session: 启动清扫失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

/** 失效官方投影缓存行（派生数据，可安全删除；官方服务常驻打开该域，走 get）。 */
async function invalidateProjectionCache(ctx: Context, sessionId: SessionId): Promise<void> {
  try {
    const domain = ctx.storageDomain.get(PROJCACHE_DOMAIN_NAME)
    if (domain === undefined) return
    await domain.table(PROJCACHE_SESSIONS_TABLE).delete(String(sessionId))
  } catch (error) {
    ctx.logger.warn(`dsh-archive-session: 投影缓存失效失败（${String(sessionId)}）：${error instanceof Error ? error.message : String(error)}`)
  }
}
/** 备份/删除后校验投影缓存是否已删除；未删除时重试一次并告警，供启动清扫兜底。 */
async function invalidateProjectionCacheGuarded(ctx: Context, sessionId: SessionId): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    await invalidateProjectionCache(ctx, sessionId)
    try {
      const domain = ctx.storageDomain.get(PROJCACHE_DOMAIN_NAME)
      if (domain === undefined || domain.table(PROJCACHE_SESSIONS_TABLE).get(String(sessionId)) === undefined) return
    } catch (error) {
      ctx.logger.warn(`dsh-archive-session: 投影缓存校验失败（${String(sessionId)}）：${error instanceof Error ? error.message : String(error)}`)
      return
    }
    if (attempt === 1) ctx.logger.warn(`dsh-archive-session: 备份/删除后投影缓存仍残留 ${String(sessionId)}，重启后启动清扫会再次清理`)
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
async function sweepStaleProjectionCache(ctx: Context): Promise<void> {
  try {
    const domain = ctx.storageDomain.get(PROJCACHE_DOMAIN_NAME)
    if (domain === undefined) return
    const headers = await ctx.sessionPersistence.list()
    const known = new Set(headers.map(header => String(header.id)))
    const table = domain.table(PROJCACHE_SESSIONS_TABLE)
    let removed = 0
    for (const key of [...table.keys()]) {
      if (known.has(String(key))) continue
      await table.delete(String(key))
      removed++
    }
    if (removed > 0) ctx.logger.warn(`dsh-archive-session: 启动清扫投影缓存移除 ${removed} 个陈旧会话`)
  } catch (error) {
    ctx.logger.warn(`dsh-archive-session: 投影缓存启动清扫失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 启动清扫：父会话已不在持久化中的孤儿 subagent 会话（origin === 'subagent'）——删除其目录、
 * 失效投影行、清理工作区记账，@ 列表不再出现。目录级删除与「删除档」同属 seam 特例；
 * 父/子任一侧仍被 dsh 进程占用时跳过本次清扫，后端不支持文件级处理时只留日志。
 */
async function sweepOrphanSubagents(ctx: Context): Promise<void> {
  try {
    const headers = await ctx.sessionPersistence.list()
    const persistedIds = new Set(headers.map(header => String(header.id)))
    let removed = 0
    for (const header of headers) {
      if (header.origin !== 'subagent' || header.parentSession === undefined) continue
      if (persistedIds.has(String(header.parentSession))) continue
      const childId = SessionId(String(header.id))
      if (ctx.sessions.get(childId) !== undefined || ctx.agents.get(childId) !== undefined) continue
      if (ctx.sessions.get(SessionId(String(header.parentSession))) !== undefined) continue
      const location = ctx.sessionPersistence.locate(header)
      const dir = location === undefined ? undefined : sessionDirectoryFor(location)
      if (dir === undefined) {
        ctx.logger.warn(`dsh-archive-session: 孤儿 subagent 会话 ${String(childId)} 的后端不支持文件级处理，跳过`)
        continue
      }
      try {
        await rm(dir, { recursive: true, force: false })
      } catch (error) {
        ctx.logger.warn(`dsh-archive-session: 孤儿 subagent 目录删除失败（${String(childId)}）：${error instanceof Error ? error.message : String(error)}`)
        continue
      }
      try {
        await detachWorkspaceAccounting(ctx, childId)
      } catch (accountingError) {
        ctx.logger.warn(`dsh-archive-session: 孤儿 subagent 工作区记账清理失败（${String(childId)}）：${String(accountingError)}`)
      }
      await invalidateProjectionCacheGuarded(ctx, childId)
      removed++
    }
    if (removed > 0) ctx.logger.warn(`dsh-archive-session: 启动清扫删除 ${removed} 个孤儿 subagent 会话`)
  } catch (error) {
    ctx.logger.warn(`dsh-archive-session: 孤儿 subagent 启动清扫失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

/** 只有已知的「单会话目录」后端（当前为 jsonl）才允许文件级移动 / 删除。 */
export function sessionDirectoryFor(location: { kind: string; path: string }): string | undefined {
  if (location.kind !== 'jsonl') return undefined
  const dir = dirname(location.path)
  if (!isAbsolute(dir) || dirname(dir) === dir || basename(dir) === '') return undefined
  return dir
}
interface SubagentTarget {
  readonly sessionId: SessionId
  readonly header: SessionHeader
  readonly dir: string
}

/** 找出某个父会话下的全部 subagent 会话；任一会话仍被占用时不处理任何文件。 */
async function listSubagentTargets(ctx: Context, parentSessionId: SessionId): Promise<SubagentTarget[]> {
  const headers = await ctx.sessionPersistence.list()
  const targets: SubagentTarget[] = []
  for (const header of headers) {
    if (header.origin !== 'subagent' || header.parentSession === undefined) continue
    if (String(header.parentSession) !== String(parentSessionId)) continue
    const sessionId = SessionId(String(header.id))
    if (ctx.sessions.get(sessionId) !== undefined || ctx.agents.get(sessionId) !== undefined) {
      throw new ArchiveError('SESSION_LIVE', `subagent 会话 ${String(sessionId)} 仍被 dsh 进程占用，不能与父会话一起处理`, 409)
    }
    const location = ctx.sessionPersistence.locate(header)
    const dir = location === undefined ? undefined : sessionDirectoryFor(location)
    if (dir === undefined) {
      throw new ArchiveError('BACKEND_UNSUPPORTED', `subagent 会话 ${String(sessionId)} 的持久化后端不支持文件级处理`, 501)
    }
    targets.push({ sessionId, header, dir })
  }
  return targets
}

/** 备份目录内 subagent 子目录名必须安全，防 sidecar 篡改后路径穿越。 */
function safeDirName(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new ArchiveError('BAD_BODY', `非法会话目录名：${value}`)
  return value
}

/** 保证传入目录名只能落到 backupRoot 下。 */
export function resolveBackupDir(backupRoot: string, backupId: string): string {
  const candidate = resolve(backupRoot, sanitizeSegment(backupId))
  const prefix = resolve(backupRoot)
  if (candidate !== prefix && !candidate.startsWith(`${prefix}${sep}`)) {
    throw new ArchiveError('BAD_BODY', '非法的备份 id')
  }
  return candidate
}

async function listBackups(backupRoot: string): Promise<unknown[]> {
  const names = await backupDirNames(backupRoot)
  const items: unknown[] = []
  for (const name of names) {
    const dir = resolveBackupDir(backupRoot, name)
    try {
      const raw = await readFile(join(dir, BACKUP_SIDECAR), 'utf8')
      const sidecar = parseBackupSidecar(JSON.parse(raw))
      if (sidecar !== undefined) {
        items.push({
          backupId: name,
          sessionId: sidecar.sessionId,
          title: sidecar.title,
          archivedAt: sidecar.archivedAt,
          workspaceIds: sidecar.workspaceIds,
          legacy: false,
        })
      }
    } catch {
      // 无合法 sidecar：按旧格式备份目录收纳（只列/删，不可恢复）。
      try {
        const info = await stat(dir)
        if (info.isDirectory()) items.push(legacyBackupItem(name, info.mtimeMs))
      } catch {
        // 目录不存在或不可读：跳过，不让列表挂死。
      }
    }
  }
  return items.sort((left, right) => String((right as { archivedAt?: string }).archivedAt ?? '').localeCompare(String((left as { archivedAt?: string }).archivedAt ?? '')))
}

/** 列出备份根下符合安全命名的目录名。 */
async function backupDirNames(backupRoot: string): Promise<string[]> {
  try {
    const names = await readdir(backupRoot)
    return names.filter(name => /^[A-Za-z0-9_-]+$/u.test(name))
  } catch {
    return []
  }
}

/** 按 sidecar 恢复单个备份目录（移动回原处 + 工作区记账 + 归档集回填）。 */
async function restoreBackupDir(ctx: Context, backupDir: string): Promise<ArchiveSidecar> {
  let sidecar: ArchiveSidecar | undefined
  try {
    const raw = await readFile(join(backupDir, BACKUP_SIDECAR), 'utf8')
    sidecar = parseBackupSidecar(JSON.parse(raw))
  } catch {
    throw new ArchiveError('UNKNOWN_BACKUP', '该备份是旧格式（缺少 sidecar），无法恢复；只能删除', 400)
  }
  if (sidecar === undefined) {
    throw new ArchiveError('BAD_BODY', '备份 sidecar 无效', 404)
  }
  // sidecar 校验：originalPath 必须是「绝对路径 + 安全命名的单层目录」，防被篡改后把备份 rename 到任意位置。
  if (!isAbsolute(sidecar.originalPath)
    || dirname(sidecar.originalPath) === sidecar.originalPath
    || !/^[A-Za-z0-9_-]+$/u.test(basename(sidecar.originalPath))) {
    throw new ArchiveError('UNKNOWN_BACKUP', '该备份 sidecar 的原始路径不合法，拒绝恢复', 400)
  }
  const sessionId = SessionId(sidecar.sessionId)
  if (ctx.sessions.get(sessionId) !== undefined || ctx.agents.get(sessionId) !== undefined) {
    throw new ArchiveError('SESSION_LIVE', '该会话仍被 dsh 进程占用（未释放），不能重复恢复')
  }

  const subagentTargets = (sidecar.subagents ?? []).map(child => {
    const childId = SessionId(child.sessionId)
    if (!isAbsolute(child.originalPath)
      || dirname(child.originalPath) === child.originalPath
      || !/^[A-Za-z0-9_-]+$/u.test(basename(child.originalPath))) {
      throw new ArchiveError('UNKNOWN_BACKUP', `subagent 会话 ${String(childId)} 的原始路径不合法，拒绝恢复`, 400)
    }
    if (ctx.sessions.get(childId) !== undefined || ctx.agents.get(childId) !== undefined) {
      throw new ArchiveError('SESSION_LIVE', `subagent 会话 ${String(childId)} 仍被 dsh 进程占用（未释放），不能重复恢复`)
    }
    return { childId, originalPath: child.originalPath, workspaceIds: child.workspaceIds }
  })
  try {
    await mkdir(dirname(sidecar.originalPath), { recursive: true })
  } catch (error) {
    throw new ArchiveError('IO_ERROR', `无法创建恢复目录：${error instanceof Error ? error.message : String(error)}`, 500)
  }
  let targetDirExists = false
  try {
    const entries = await readdir(sidecar.originalPath)
    if (entries.length > 0) {
      throw new ArchiveError('TARGET_EXISTS', '原始会话位置已存在内容（可能此前已恢复成功），拒绝覆盖恢复')
    }
    targetDirExists = true
  } catch (error) {
    if (error instanceof ArchiveError) throw error
    // 目录不存在可继续；其他读取错误由后续 rename 报出。
  }
  if (targetDirExists) {
    await rm(sidecar.originalPath, { recursive: true, force: false })
  }
  await rename(backupDir, sidecar.originalPath)
  for (const target of subagentTargets) {
    try {
      await mkdir(dirname(target.originalPath), { recursive: true })
      await rename(join(sidecar.originalPath, 'subagents', safeDirName(basename(target.originalPath))), target.originalPath)
    } catch (error) {
      // 父目录已移回，属「已恢复但 subagent 未移回」——明确提示，避免重试撞 TARGET_EXISTS。
      throw new ArchiveError('IO_ERROR', `父会话已恢复，但 subagent 会话目录移回失败（${String(target.childId)}，请勿重复恢复）：${error instanceof Error ? error.message : String(error)}`, 500)
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
        ctx.logger.warn(`dsh-archive-session: 恢复后 subagent 工作区记账失败（${String(target.childId)}）：${String(childError)}`)
      }
    }
  } catch (error) {
    // 目录已移回，属「已恢复但记账失败」——明确提示，避免重试撞 TARGET_EXISTS。
    throw new ArchiveError('IO_ERROR', `会话已恢复，但工作区记账失败（请勿重复恢复）：${error instanceof Error ? error.message : String(error)}`, 500)
  }
  try {
    await addArchivedId(ctx, sessionId)
  } catch (cleanupError) {
    ctx.logger.warn(`dsh-archive-session: 恢复后归档集同步失败：${String(cleanupError)}`)
  }
  return sidecar
}

/**
 * host half 入口：归档会话管理路由。
 * @param ctx - DSH 插件上下文。
 * @param config - 插件配置（cordis.patch.yml 注入）。
 */
export function apply(ctx: Context, config: Readonly<Partial<ArchiveConfig>> = {}): void {
  const settings = normalizeArchiveConfig(config)

  // 启动清扫（均不影响加载）：归档集幽灵 id（官方写操作复活产物）、投影缓存陈旧行、孤儿 subagent 会话。
  void sweepGhostArchivedIds(ctx)
  void sweepStaleProjectionCache(ctx)
  void sweepOrphanSubagents(ctx)

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler: async (req, res) => {
      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
      try {
        if (req.method === 'GET' && pathname === `${PREFIX}/list`) {
          const headers = await ctx.sessionPersistence.list()
          const byId = new Map(headers.map(header => [String(header.id), header]))
          // 以域为准读归档集：官方 registry 内存态不订阅域变更，直写后会陈旧。
          const archivedIds = await readArchivedIds(ctx)
          const presentIds = archivedIds.filter(id => byId.has(String(id)))
          const observations = presentIds.length > 0
            ? await ctx.sessionQuery.readTitleSnapshots(presentIds.map(id => SessionId(String(id))))
            : []
          const workspaces = ctx.workspaceRegistry.list()
          const items = presentIds.map((id, index) => {
            const header = byId.get(String(id)) as SessionHeader
            const sessionId = SessionId(String(id))
            const liveSession = ctx.sessions.get(sessionId)
            const agent = ctx.agents.get(sessionId)
            const location = ctx.sessionPersistence.locate(header)
            return {
              sessionId: String(id),
              title: titleFromObservation(observations[index], header.id),
              updatedAt: header.createdAt,
              live: liveSession !== undefined,
              running: agent?.status === 'running',
              backendSupported: location !== undefined && sessionDirectoryFor(location) !== undefined,
              workspaceIds: workspaceIdsFor(workspaces, sessionId),
            }
          })
          sendJson(res, 200, { items })
          return
        }

        if (req.method === 'GET' && pathname === `${PREFIX}/strays`) {
          const headers = await ctx.sessionPersistence.list()
          const archivedIds = await readArchivedIds(ctx)
          const attachedIds = ctx.workspaceRegistry.list().flatMap(workspace => workspace.sessionIds.map(id => String(id)))
          const strayIds = straySessionIds(headers.map(header => String(header.id)), archivedIds.map(id => String(id)), attachedIds)
          const items = []
          for (const header of headers) {
            if (!strayIds.includes(String(header.id))) continue
            const sessionId = SessionId(String(header.id))
            const location = ctx.sessionPersistence.locate(header)
            items.push({
              sessionId: String(header.id),
              title: await readTitle(ctx, sessionId, header.id),
              createdAt: header.createdAt,
              blank: await readStrayBlankness(ctx, sessionId),
              live: ctx.sessions.get(sessionId) !== undefined,
              running: ctx.agents.get(sessionId)?.status === 'running',
              backendSupported: location !== undefined && sessionDirectoryFor(location) !== undefined,
            })
          }
          sendJson(res, 200, { items })
          return
        }

        if (req.method === 'GET' && pathname === `${PREFIX}/backups`) {
          sendJson(res, 200, { items: await listBackups(settings.backupRoot) })
          return
        }

        if (req.method === 'GET' && pathname === `${PREFIX}/backup-dir`) {
          // 面板提示信息用：明示备份实际存放位置（卸载影响可见化）；displayPath 掩码 home 前缀（~）。
          sendJson(res, 200, {
            path: settings.backupRoot,
            displayPath: maskHomePath(settings.backupRoot, homedir()),
          })
          return
        }

        if (req.method === 'POST' && (pathname === `${PREFIX}/backup` || pathname === `${PREFIX}/delete`)) {
          const parsed = bodyObject(await readJsonBody(req), '请求体必须是 JSON 对象')
          if (typeof parsed.sessionId !== 'string' || parsed.sessionId.trim() === '') {
            throw new ArchiveError('BAD_BODY', 'sessionId 必须是非空字符串')
          }
          const sessionId = SessionId(parsed.sessionId)
          const archivedIds = await readArchivedIds(ctx)
          const headers = await ctx.sessionPersistence.list()
          const attachedIds = ctx.workspaceRegistry.list().flatMap(workspace => workspace.sessionIds.map(id => String(id)))
          const strayIds = straySessionIds(headers.map(header => String(header.id)), archivedIds.map(id => String(id)), attachedIds)
          const isArchived = archivedIds.some(id => String(id) === String(sessionId))
          const isStray = strayIds.includes(String(sessionId))
          if (!isArchived && !isStray) {
            throw new ArchiveError('NOT_ARCHIVED', '只有已归档或游离会话才能备份或删除')
          }
          const live = ctx.sessions.get(sessionId)
          const header = live?.header ?? headers.find(candidate => String(candidate.id) === String(sessionId))
          if (header === undefined) {
            throw new ArchiveError('UNKNOWN_SESSION', '会话持久化中没有这个会话', 404)
          }
          const title = await readTitle(ctx, sessionId, header.id)
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
            throw new ArchiveError('CONFIRMATION_FAILED', '备份需要二次确认')
          }

          const workspaces = workspaceIdsFor(ctx.workspaceRegistry.list(), sessionId)
          ensureSessionNotLive(ctx, sessionId)
          const location = ctx.sessionPersistence.locate(header)
          const sessionDir = location === undefined ? undefined : sessionDirectoryFor(location)
          if (sessionDir === undefined) {
            throw new ArchiveError('BACKEND_UNSUPPORTED', '当前会话持久化后端不提供已知的单会话目录，无法备份/删除', 501)
          }

          const subagents = await listSubagentTargets(ctx, sessionId)

          if (pathname.endsWith('/backup')) {
            await ensureBackupRoot(settings.backupRoot)
            const backupId = `${sanitizeSegment(String(sessionId))}-${Date.now()}`
            const backupDir = resolveBackupDir(settings.backupRoot, backupId)
            const moved: Array<{ from: string; to: string }> = []
            const rollbackMoves = async (): Promise<void> => {
              for (const move of [...moved].reverse()) {
                try {
                  await rename(move.to, move.from)
                } catch (rollbackError) {
                  ctx.logger.warn(`dsh-archive-session: 回滚失败（${move.to} → ${move.from}）：${String(rollbackError)}`)
                }
              }
            }
            try {
              await rename(sessionDir, backupDir)
              moved.push({ from: sessionDir, to: backupDir })
            } catch (error) {
              throw new ArchiveError('IO_ERROR', `移动父会话目录失败：${error instanceof Error ? error.message : String(error)}`, 500)
            }
            const subagentSidecars: ArchiveSubagentSidecar[] = []
            if (subagents.length > 0) {
              const subagentsDir = join(backupDir, 'subagents')
              try {
                await mkdir(subagentsDir, { recursive: true })
                for (const child of subagents) {
                  const childDirName = safeDirName(basename(child.dir))
                  const to = join(subagentsDir, childDirName)
                  await rename(child.dir, to)
                  moved.push({ from: child.dir, to })
                  subagentSidecars.push({
                    sessionId: String(child.sessionId),
                    title: await readTitle(ctx, child.sessionId, child.header.id),
                    originalPath: child.dir,
                    workspaceIds: workspaceIdsFor(ctx.workspaceRegistry.list(), child.sessionId),
                  })
                }
              } catch (error) {
                await rollbackMoves()
                // 回滚成功后 backupDir 已移回原处，清掉残留的空 subagents/ 子目录（非空时保留，避免误删未移回的会话）。
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
              await writeFile(join(backupDir, BACKUP_SIDECAR), JSON.stringify(sidecar, null, 2), 'utf8')
            } catch (error) {
              await rollbackMoves()
              await rmdir(join(sessionDir, 'subagents')).catch(() => undefined)
              throw new ArchiveError('IO_ERROR', `写入备份 sidecar 失败（已回滚）：${error instanceof Error ? error.message : String(error)}`, 500)
            }
            await detachWorkspaceAccounting(ctx, sessionId)
            for (const child of subagents) {
              try {
                await detachWorkspaceAccounting(ctx, child.sessionId)
              } catch (cleanupError) {
                ctx.logger.warn(`dsh-archive-session: subagent 工作区记账清理失败（${String(child.sessionId)}）：${String(cleanupError)}`)
              }
            }
            try {
              await removeArchivedId(ctx, sessionId)
            } catch (cleanupError) {
              ctx.logger.warn(`dsh-archive-session: 归档集清理失败：${String(cleanupError)}`)
            }
            await invalidateProjectionCacheGuarded(ctx, sessionId)
            for (const child of subagents) {
              await invalidateProjectionCacheGuarded(ctx, child.sessionId)
            }
            // 通知会话列表消费者移除条目（官方公开事件；会话目录已移走）。
            ctx.emit('api-session/removed', sessionId)
            for (const child of subagents) {
              ctx.emit('api-session/removed', child.sessionId)
            }
            sendJson(res, 200, {
              ok: true,
              backupId,
              workspaceIds: workspaces,
              subagentIds: subagents.map(child => String(child.sessionId)),
            })
            return
          }

          await rm(sessionDir, { recursive: true, force: false })
          for (const child of subagents) {
            try {
              await rm(child.dir, { recursive: true, force: false })
            } catch (error) {
              ctx.logger.warn(`dsh-archive-session: 删除 subagent 会话目录失败（${String(child.sessionId)}），启动清扫会兜底：${error instanceof Error ? error.message : String(error)}`)
            }
          }
          await detachWorkspaceAccounting(ctx, sessionId)
          for (const child of subagents) {
            try {
              await detachWorkspaceAccounting(ctx, child.sessionId)
            } catch (cleanupError) {
              ctx.logger.warn(`dsh-archive-session: subagent 工作区记账清理失败（${String(child.sessionId)}）：${String(cleanupError)}`)
            }
          }
          try {
            await removeArchivedId(ctx, sessionId)
          } catch (cleanupError) {
            ctx.logger.warn(`dsh-archive-session: 归档集清理失败：${String(cleanupError)}`)
          }
          await invalidateProjectionCacheGuarded(ctx, sessionId)
          for (const child of subagents) {
            await invalidateProjectionCacheGuarded(ctx, child.sessionId)
          }
          // 通知会话列表消费者移除条目（官方公开事件；会话目录已删除）。
          ctx.emit('api-session/removed', sessionId)
          for (const child of subagents) {
            ctx.emit('api-session/removed', child.sessionId)
          }
          sendJson(res, 200, { ok: true, deleted: true, workspaceIds: workspaces, subagentIds: subagents.map(child => String(child.sessionId)) })
          return
        }

        if (req.method === 'POST' && pathname === `${PREFIX}/backup-delete`) {
          const parsed = bodyObject(await readJsonBody(req), '请求体必须是 JSON 对象')
          if (typeof parsed.backupId !== 'string' || parsed.backupId.trim() === '') {
            throw new ArchiveError('BAD_BODY', 'backupId 必须是非空字符串')
          }
          if (parsed.confirm !== true) {
            throw new ArchiveError('CONFIRMATION_FAILED', '删除备份需要二次确认')
          }
          const backupDir = resolveBackupDir(settings.backupRoot, parsed.backupId)
          let info
          try {
            info = await stat(backupDir)
          } catch {
            throw new ArchiveError('UNKNOWN_BACKUP', '备份不存在', 404)
          }
          if (!info.isDirectory()) {
            throw new ArchiveError('UNKNOWN_BACKUP', '备份 id 不是目录', 404)
          }
          await rm(backupDir, { recursive: true, force: false })
          sendJson(res, 200, { ok: true, backupId: parsed.backupId })
          return
        }

        if (req.method === 'POST' && pathname === `${PREFIX}/restore`) {
          const parsed = bodyObject(await readJsonBody(req), '请求体必须是 JSON 对象')
          if (typeof parsed.backupId !== 'string' || parsed.backupId.trim() === '') {
            throw new ArchiveError('BAD_BODY', 'backupId 必须是非空字符串')
          }
          const backupDir = resolveBackupDir(settings.backupRoot, parsed.backupId)
          const sidecar = await restoreBackupDir(ctx, backupDir)
          sendJson(res, 200, { ok: true, sessionId: sidecar.sessionId, workspaceIds: sidecar.workspaceIds })
          return
        }

        if (req.method === 'POST' && pathname === `${PREFIX}/backup-restore-all`) {
          const parsed = bodyObject(await readJsonBody(req), '请求体必须是 JSON 对象')
          if (parsed.confirm !== true) {
            throw new ArchiveError('CONFIRMATION_FAILED', '恢复全部备份需要二次确认')
          }
          const names = await backupDirNames(settings.backupRoot)
          const restored: string[] = []
          const failed: Array<{ backupId: string; message: string }> = []
          let skippedLegacy = 0
          for (const name of names) {
            const dir = resolveBackupDir(settings.backupRoot, name)
            try {
              const sidecar = await restoreBackupDir(ctx, dir)
              restored.push(sidecar.sessionId)
            } catch (error) {
              if (error instanceof ArchiveError && error.code === 'UNKNOWN_BACKUP') {
                skippedLegacy += 1
                continue
              }
              failed.push({ backupId: name, message: error instanceof Error ? error.message : String(error) })
            }
          }
          sendJson(res, 200, { ok: true, restored, skippedLegacy, failed })
          return
        }

        if (req.method === 'POST' && pathname === `${PREFIX}/backup-delete-all`) {
          const parsed = bodyObject(await readJsonBody(req), '请求体必须是 JSON 对象')
          if (parsed.confirm !== true) {
            throw new ArchiveError('CONFIRMATION_FAILED', '删除全部备份需要二次确认')
          }
          const names = await backupDirNames(settings.backupRoot)
          const failed: string[] = []
          let deleted = 0
          for (const name of names) {
            try {
              const dir = resolveBackupDir(settings.backupRoot, name)
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

        sendJson(res, 404, { error: { code: 'BAD_BODY', message: `未知的 archive-session 路由：${pathname}` } })
      } catch (error) {
        sendError(res, error)
      }
    },
  }), 'dsh-archive-session: REST routes')
}
