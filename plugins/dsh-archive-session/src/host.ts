/** dsh-archive-session host half：标题缓存 + 归档会话 REST 路由。 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
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
  BACKUP_SIDECAR, isDeleteConfirmationSufficient, normalizeArchiveConfig, parseBackupSidecar,
  sanitizeSegment, TitleCache, type ArchiveConfig,
} from './archive.js'

export const name = 'dsh-archive-session'
export const inject = ['webServer', 'sessions', 'agents', 'workspaceRegistry', 'sessionPersistence', 'sessionQuery', 'storageDomain']

export type { ArchiveConfig }

const PREFIX = '/api/archive-session'
const MAX_BODY_BYTES = 64 * 1024

type ArchiveErrorCode =
  | 'BAD_BODY'
  | 'NOT_ARCHIVED'
  | 'UNKNOWN_SESSION'
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
  const message = error instanceof Error ? error.message : String(error)
  sendJson(res, 500, { error: { code: 'IO_ERROR', message } })
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

async function stopAndFlushLiveSession(ctx: Context, sessionId: SessionId): Promise<void> {
  const agent = ctx.agents.get(sessionId)
  if (agent !== undefined) {
    agent.cancel({ kind: 'hook', reason: 'dsh-archive-session' })
    await agent.whenIdle()
  }
  const live = ctx.sessions.get(sessionId)
  if (live !== undefined) {
    await ctx.sessions.flush(live)
  }
  if (agent !== undefined) {
    await agent.ctx.fiber.dispose()
  }
  if (ctx.sessions.get(sessionId) !== undefined) {
    throw new ArchiveError('SESSION_LIVE', '会话仍在运行且无法安全卸载：请先切换到其他会话后重试')
  }
}

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

/** 经公开 storageDomain 从归档集中移除会话；domain/changed 会自动广播 archived-sessions-changed。 */
async function removeArchivedId(ctx: Context, sessionId: SessionId): Promise<void> {
  const domain = await ctx.storageDomain.open(workspaceDomainSpec)
  const state = domain.global.get()
  const archivedSessionIds = state.archivedSessionIds.filter(id => String(id) !== String(sessionId))
  if (archivedSessionIds.length === state.archivedSessionIds.length) return
  await domain.global.set({ ...state, archivedSessionIds })
}

/** 恢复时把会话加回归档集，并让 WorkspaceRegistry 的内存态也回到一致。 */
async function addArchivedId(ctx: Context, sessionId: SessionId): Promise<void> {
  const domain = await ctx.storageDomain.open(workspaceDomainSpec)
  const state = domain.global.get()
  if (!state.archivedSessionIds.some(id => String(id) === String(sessionId))) {
    await domain.global.set({ ...state, archivedSessionIds: [...state.archivedSessionIds, sessionId] })
  }
  await ctx.workspaceRegistry.archiveSession(sessionId)
}

/** 只有已知的「单会话目录」后端（当前为 jsonl）才允许文件级移动 / 删除。 */
function sessionDirectoryFor(location: { kind: string; path: string }): string | undefined {
  if (location.kind !== 'jsonl') return undefined
  const dir = dirname(location.path)
  if (!isAbsolute(dir) || dirname(dir) === dir || basename(dir) === '') return undefined
  return dir
}

/** 保证传入目录名只能落到 backupRoot 下。 */
function resolveBackupDir(backupRoot: string, backupId: string): string {
  const candidate = resolve(backupRoot, sanitizeSegment(backupId))
  const prefix = resolve(backupRoot)
  if (candidate !== prefix && !candidate.startsWith(`${prefix}${sep}`)) {
    throw new ArchiveError('BAD_BODY', '非法的备份 id')
  }
  return candidate
}

async function listBackups(backupRoot: string): Promise<unknown[]> {
  let names: string[] = []
  try {
    names = await readdir(backupRoot)
  } catch {
    return []
  }
  const items: unknown[] = []
  for (const name of names) {
    if (!/^[A-Za-z0-9_-]+$/u.test(name)) continue
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
        })
      }
    } catch {
      // 备份目录里没有合法 sidecar 时跳过，不让列表挂死。
    }
  }
  return items.sort((left, right) => String((right as { archivedAt?: string }).archivedAt ?? '').localeCompare(String((left as { archivedAt?: string }).archivedAt ?? '')))
}

/**
 * host half 入口：标题缓存 + 归档会话管理路由。
 * @param ctx - DSH 插件上下文。
 * @param config - 插件配置（cordis.patch.yml 注入）。
 */
export function apply(ctx: Context, config: Readonly<Partial<ArchiveConfig>> = {}): void {
  const settings = normalizeArchiveConfig(config)

  // 路线 A：给 readTitleSnapshots 加短 TTL 缓存，避免 @ 候选逐会话全量解码。
  const titleCache = new TitleCache(settings.titleCacheTtlMs, settings.titleCacheMaxEntries)
  const sessionQuery = ctx.sessionQuery
  const originalReadTitleSnapshots = sessionQuery.readTitleSnapshots.bind(sessionQuery) as typeof sessionQuery.readTitleSnapshots
  sessionQuery.readTitleSnapshots = (async (sessionIds, signal) => {
    const ids = sessionIds.map(id => String(id))
    const cached = ids.map(id => titleCache.get(id) as SessionTitleObservationResult | undefined)
    const missingIndexes = cached
      .map((value, index) => value === undefined ? index : -1)
      .filter(index => index >= 0)
    if (missingIndexes.length === 0) {
      return cached.map(value => value as SessionTitleObservationResult)
    }
    const missingIds = missingIndexes.map(index => sessionIds[index] as SessionId)
    const fetched = await originalReadTitleSnapshots(missingIds, signal)
    for (const [offset, index] of missingIndexes.entries()) {
      const result = fetched[offset] as SessionTitleObservationResult | undefined
      if (result?.status === 'fulfilled') titleCache.set(ids[index] as string, result)
      cached[index] = result
    }
    return cached.map(value => value as SessionTitleObservationResult)
  }) as typeof sessionQuery.readTitleSnapshots
  ctx.effect(() => () => {
    sessionQuery.readTitleSnapshots = originalReadTitleSnapshots
  }, 'dsh-archive-session: restore readTitleSnapshots')

  ctx.effect(() => {
    const off = ctx.on('session/event', (session, event) => {
      if (event.type === 'session/title') titleCache.delete(String(session.id))
    })
    return () => { off() }
  }, 'dsh-archive-session: title cache invalidation')

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler: async (req, res) => {
      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
      try {
        if (req.method === 'GET' && pathname === `${PREFIX}/list`) {
          const headers = await ctx.sessionPersistence.list()
          const byId = new Map(headers.map(header => [String(header.id), header]))
          const archivedIds = [...ctx.workspaceRegistry.archivedSessionIds]
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

        if (req.method === 'GET' && pathname === `${PREFIX}/backups`) {
          sendJson(res, 200, { items: await listBackups(settings.backupRoot) })
          return
        }

        if (req.method === 'POST' && (pathname === `${PREFIX}/backup` || pathname === `${PREFIX}/delete`)) {
          const parsed = bodyObject(await readJsonBody(req), '请求体必须是 JSON 对象')
          if (typeof parsed.sessionId !== 'string' || parsed.sessionId.trim() === '') {
            throw new ArchiveError('BAD_BODY', 'sessionId 必须是非空字符串')
          }
          const sessionId = SessionId(parsed.sessionId)
          if (!ctx.workspaceRegistry.archivedSessionIds.includes(sessionId)) {
            throw new ArchiveError('NOT_ARCHIVED', '只有已归档会话才能备份或删除')
          }
          const live = ctx.sessions.get(sessionId)
          const headers = await ctx.sessionPersistence.list()
          const header = live?.header ?? headers.find(candidate => String(candidate.id) === String(sessionId))
          if (header === undefined) {
            throw new ArchiveError('UNKNOWN_SESSION', '会话持久化中没有这个会话', 404)
          }
          const title = await readTitle(ctx, sessionId, header.id)
          if (pathname.endsWith('/delete')) {
            if (!isDeleteConfirmationSufficient(title, parsed.confirmTitle)) {
              throw new ArchiveError('CONFIRMATION_FAILED', '删除确认失败：请输入完整会话标题')
            }
          } else if (parsed.confirm !== true) {
            throw new ArchiveError('CONFIRMATION_FAILED', '备份需要二次确认')
          }

          const workspaces = workspaceIdsFor(ctx.workspaceRegistry.list(), sessionId)
          await stopAndFlushLiveSession(ctx, sessionId)
          const location = ctx.sessionPersistence.locate(header)
          const sessionDir = location === undefined ? undefined : sessionDirectoryFor(location)
          if (sessionDir === undefined) {
            throw new ArchiveError('BACKEND_UNSUPPORTED', '当前会话持久化后端不提供已知的单会话目录，无法备份/删除', 501)
          }

          if (pathname.endsWith('/backup')) {
            await ensureBackupRoot(settings.backupRoot)
            const backupId = `${sanitizeSegment(String(sessionId))}-${Date.now()}`
            const backupDir = resolveBackupDir(settings.backupRoot, backupId)
            await rename(sessionDir, backupDir)
            const sidecar = {
              version: 1,
              sessionId: String(sessionId),
              title,
              originalPath: sessionDir,
              archivedAt: new Date().toISOString(),
              workspaceIds: workspaces,
            }
            try {
              await writeFile(join(backupDir, BACKUP_SIDECAR), JSON.stringify(sidecar, null, 2), 'utf8')
            } catch (error) {
              try {
                await rename(backupDir, sessionDir)
              } catch {
                // 回滚失败也保留原始错误。
              }
              throw new ArchiveError('IO_ERROR', `写入备份 sidecar 失败：${error instanceof Error ? error.message : String(error)}`, 500)
            }
            await detachWorkspaceAccounting(ctx, sessionId)
            try {
              await removeArchivedId(ctx, sessionId)
            } catch (cleanupError) {
              ctx.logger.warn(`dsh-archive-session: 归档集清理失败：${String(cleanupError)}`)
            }
            sendJson(res, 200, { ok: true, backupId, workspaceIds: workspaces })
            return
          }

          await rm(sessionDir, { recursive: true, force: false })
          await detachWorkspaceAccounting(ctx, sessionId)
          try {
            await removeArchivedId(ctx, sessionId)
          } catch (cleanupError) {
            ctx.logger.warn(`dsh-archive-session: 归档集清理失败：${String(cleanupError)}`)
          }
          sendJson(res, 200, { ok: true, deleted: true, workspaceIds: workspaces })
          return
        }

        if (req.method === 'POST' && pathname === `${PREFIX}/restore`) {
          const parsed = bodyObject(await readJsonBody(req), '请求体必须是 JSON 对象')
          if (typeof parsed.backupId !== 'string' || parsed.backupId.trim() === '') {
            throw new ArchiveError('BAD_BODY', 'backupId 必须是非空字符串')
          }
          const backupDir = resolveBackupDir(settings.backupRoot, parsed.backupId)
          const raw = await readFile(join(backupDir, BACKUP_SIDECAR), 'utf8')
          const sidecar = parseBackupSidecar(JSON.parse(raw))
          if (sidecar === undefined) {
            throw new ArchiveError('BAD_BODY', '备份 sidecar 无效', 404)
          }
          const sessionId = SessionId(sidecar.sessionId)
          if (ctx.sessions.get(sessionId) !== undefined || ctx.agents.get(sessionId) !== undefined) {
            throw new ArchiveError('SESSION_LIVE', '该会话当前已打开，不能重复恢复')
          }
          try {
            await mkdir(dirname(sidecar.originalPath), { recursive: true })
          } catch (error) {
            throw new ArchiveError('IO_ERROR', `无法创建恢复目录：${error instanceof Error ? error.message : String(error)}`, 500)
          }
          let targetDirExists = false
          try {
            const entries = await readdir(sidecar.originalPath)
            if (entries.length > 0) {
              throw new ArchiveError('TARGET_EXISTS', '原始会话位置已存在内容，拒绝覆盖恢复')
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
          await attachWorkspaceAccounting(ctx, sessionId, sidecar.workspaceIds)
          try {
            await addArchivedId(ctx, sessionId)
          } catch (cleanupError) {
            ctx.logger.warn(`dsh-archive-session: 恢复后归档集同步失败：${String(cleanupError)}`)
          }
          sendJson(res, 200, { ok: true, sessionId: sidecar.sessionId, workspaceIds: sidecar.workspaceIds })
          return
        }

        sendJson(res, 404, { error: { code: 'BAD_BODY', message: `未知的 archive-session 路由：${pathname}` } })
      } catch (error) {
        sendError(res, error)
      }
    },
  }), 'dsh-archive-session: REST routes')
}
