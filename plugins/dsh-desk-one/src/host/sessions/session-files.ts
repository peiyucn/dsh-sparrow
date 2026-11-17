

import { mkdir, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import { SessionId, type SessionHeader } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-workspace'
import {
  archivedIdsToRemove, sanitizeSegment, subagentDescendantIds, type ArchiveSubagentSidecar,
  type HeaderFactsStore,
} from './archive.js'
import { unsupportedStoredFormatReason } from './compat.js'
import { ENOENT, PACKAGE_NAME, SIDECAR_VERSION, TRASH_SIDECAR } from './constants.js'
import type { DeleteMutationResponse, TrashMutationResponse } from '../../session-admin.js'
import { detachWorkspaceAccounting, removeArchivedIds, workspaceIndexFor } from './archive-set.js'
import type { RegistryMutationSurface } from './gates.js'
import type { HeaderFacts } from './headers.js'
import { treeHeaderOf } from './headers.js'
import { SessionsError } from './errors.js'
import { invalidateProjectionCacheGuarded } from './projection.js'
import { ensureTrashRoot, resolveTrashDir, safeDirName } from './trash.js'
import { readTitle } from './titles.js'


export function ensureSessionNotLive(ctx: Context, sessionId: SessionId): void {
  const agent = ctx.agents.get(sessionId)

  if (agent !== undefined && agent.status === 'running') {
    throw new SessionsError('SESSION_LIVE', '该会话正在生成回复：请先停止生成后再移入回收站', 409)
  }
  if (agent !== undefined || ctx.sessions.get(sessionId) !== undefined) {
    throw new SessionsError(
      'SESSION_LIVE',
      '该会话仍被 dsh 进程占用（未释放），无法安全移动其文件：请先关闭该会话（或停止生成）再重试；仍被占用可重启 dsh 后操作',
      409,
    )
  }
}


export function sessionDirectoryFor(location: { kind: string; path: string }): string | undefined {
  if (location.kind !== 'jsonl') return undefined



  if (typeof location.path !== 'string' || location.path === '') return undefined
  const dir = dirname(location.path)
  if (!isAbsolute(dir) || dirname(dir) === dir || basename(dir) === '') return undefined
  return dir
}


export function sessionDirectoryFromFacts(facts: HeaderFacts, sessionId: SessionId | string): string | undefined {
  const location = facts.locations.get(String(sessionId))
  return location === undefined ? undefined : sessionDirectoryFor(location)
}


export function assertHeaderFormatSupported(header: SessionHeader): void {
  const reason = unsupportedStoredFormatReason([header])
  if (reason === undefined) return
  throw new SessionsError('BACKEND_UNSUPPORTED', `${reason}；已拒绝本次操作（升级本插件后自动恢复）`, 501)
}


export async function listSubagentTargets(
  ctx: Context,
  parentSessionId: SessionId,
  headerFacts: HeaderFactsStore<HeaderFacts>,
): Promise<SubagentTarget[]> {
  const { headers, locations } = await headerFacts.get()
  const byId = new Map(headers.map(header => [String(header.id), header]))


  const descendantIds = subagentDescendantIds(headers.map(treeHeaderOf), String(parentSessionId))
  const targets: SubagentTarget[] = []
  for (const id of descendantIds) {
    const header = byId.get(id)


    if (header === undefined) continue
    assertHeaderFormatSupported(header)
    const sessionId = SessionId(String(header.id))
    if (ctx.sessions.get(sessionId) !== undefined || ctx.agents.get(sessionId) !== undefined) {
      throw new SessionsError('SESSION_LIVE', `subagent 会话 ${String(sessionId)} 仍被 dsh 进程占用，不能与父会话一起处理`, 409)
    }
    const location = locations.get(id)
    const dir = location === undefined ? undefined : sessionDirectoryFor(location)
    if (dir === undefined) {
      throw new SessionsError('BACKEND_UNSUPPORTED', `subagent 会话 ${String(sessionId)} 的持久化后端不支持文件级处理`, 501)
    }
    targets.push({ sessionId, header, dir })
  }
  return targets
}

interface SubagentTarget {
  readonly sessionId: SessionId
  readonly header: SessionHeader
  readonly dir: string
}


interface SessionMoveAction {
  readonly sessionId: SessionId
  readonly sessionDir: string
  readonly title: string
  readonly subagents: readonly SubagentTarget[]
  readonly workspaceIds: readonly string[]
}


interface SessionDeleteAction {
  readonly sessionId: SessionId
  readonly sessionDir: string
  readonly subagents: readonly SubagentTarget[]
  readonly workspaceIds: readonly string[]
}


export async function moveSessionToTrash(
  ctx: Context,
  surface: RegistryMutationSurface,
  trashRoot: string,
  action: SessionMoveAction,
): Promise<TrashMutationResponse> {
  const { sessionId, subagents } = action
  await ensureTrashRoot(trashRoot)
  const trashId = `${sanitizeSegment(String(sessionId))}-${Date.now()}`
  const trashDir = resolveTrashDir(trashRoot, trashId)
  const moved: Array<{ from: string; to: string }> = []
  const rollbackMoves = async (): Promise<void> => {
    for (const move of [...moved].reverse()) {
      try {
        await rename(move.to, move.from)
      } catch (rollbackError) {
        ctx.logger.warn(`${PACKAGE_NAME}: 回滚失败（${move.to} → ${move.from}）：${String(rollbackError)}`)
      }
    }
  }
  try {
    await rename(action.sessionDir, trashDir)
    moved.push({ from: action.sessionDir, to: trashDir })
  } catch (error) {





    if ((error as NodeJS.ErrnoException)?.code === ENOENT) {
      throw new SessionsError('UNKNOWN_SESSION', '会话目录不在磁盘上（可能已被移走或删除）：没有可移入回收站的内容，请刷新面板', 404)
    }
    throw new SessionsError('IO_ERROR', `移动父会话目录失败：${error instanceof Error ? error.message : String(error)}`, 500)
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





          if ((error as NodeJS.ErrnoException)?.code === ENOENT) {
            ctx.logger.warn(`${PACKAGE_NAME}: subagent 会话目录不在磁盘上（${String(child.sessionId)}），已跳过搬运：${error instanceof Error ? error.message : String(error)}`)
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



          ...child.header.parentSession === undefined ? {} : { parentSessionId: String(child.header.parentSession) },
        })
      }
    } catch (error) {
      await rollbackMoves()


      await rmdir(join(action.sessionDir, 'subagents')).catch(() => undefined)
      throw new SessionsError('IO_ERROR', `移动 subagent 会话目录失败（已回滚）：${error instanceof Error ? error.message : String(error)}`, 500)
    }
  }
  const sidecar = {
    version: SIDECAR_VERSION,
    sessionId: String(sessionId),
    title: action.title,
    originalPath: action.sessionDir,
    archivedAt: new Date().toISOString(),
    workspaceIds: action.workspaceIds,
    subagents: subagentSidecars.length > 0 ? subagentSidecars : undefined,
  }
  try {
    await writeFile(join(trashDir, TRASH_SIDECAR), JSON.stringify(sidecar, null, 2), 'utf8')
  } catch (error) {
    await rollbackMoves()
    await rmdir(join(action.sessionDir, 'subagents')).catch(() => undefined)
    throw new SessionsError('IO_ERROR', `写入回收站 sidecar 失败（已回滚）：${error instanceof Error ? error.message : String(error)}`, 500)
  }



  try {
    await detachWorkspaceAccounting(ctx, sessionId)
  } catch (cleanupError) {
    ctx.logger.warn(`${PACKAGE_NAME}: 工作区记账清理失败（${String(sessionId)}）：${String(cleanupError)}`)
  }
  for (const child of subagents) {
    try {
      await detachWorkspaceAccounting(ctx, child.sessionId)
    } catch (cleanupError) {
      ctx.logger.warn(`${PACKAGE_NAME}: subagent 工作区记账清理失败（${String(child.sessionId)}）：${String(cleanupError)}`)
    }
  }
  const subagentIds = subagents.map(child => String(child.sessionId))
  try {
    await removeArchivedIds(surface, archivedIdsToRemove(String(sessionId), subagentIds))
  } catch (cleanupError) {
    ctx.logger.warn(`${PACKAGE_NAME}: 归档集清理失败：${String(cleanupError)}`)
  }




  ctx.emit('api-session/removed', sessionId)
  for (const child of subagents) {
    ctx.emit('api-session/removed', child.sessionId)
  }
  return { ok: true, trashId, workspaceIds: action.workspaceIds, subagentIds }
}


export async function deleteSessionTree(
  ctx: Context,
  surface: RegistryMutationSurface,
  action: SessionDeleteAction,
): Promise<DeleteMutationResponse> {
  const { sessionId, subagents } = action



  await rm(action.sessionDir, { recursive: true, force: true })



  const deletedSubagentIds: string[] = []
  for (const child of subagents) {
    try {




      await rm(child.dir, { recursive: true, force: true })
      deletedSubagentIds.push(String(child.sessionId))
    } catch (error) {
      ctx.logger.warn(`${PACKAGE_NAME}: 删除 subagent 会话目录失败（${String(child.sessionId)}），属 best-effort 清理、已跳过并保留归档标记：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const deletedSubagentIdSet = new Set(deletedSubagentIds)


  try {
    await detachWorkspaceAccounting(ctx, sessionId)
  } catch (cleanupError) {
    ctx.logger.warn(`${PACKAGE_NAME}: 工作区记账清理失败（${String(sessionId)}）：${String(cleanupError)}`)
  }
  for (const child of subagents) {
    if (!deletedSubagentIdSet.has(String(child.sessionId))) continue
    try {
      await detachWorkspaceAccounting(ctx, child.sessionId)
    } catch (cleanupError) {
      ctx.logger.warn(`${PACKAGE_NAME}: subagent 工作区记账清理失败（${String(child.sessionId)}）：${String(cleanupError)}`)
    }
  }
  try {
    await removeArchivedIds(surface, archivedIdsToRemove(String(sessionId), deletedSubagentIds))
  } catch (cleanupError) {
    ctx.logger.warn(`${PACKAGE_NAME}: 归档集清理失败：${String(cleanupError)}`)
  }
  await invalidateProjectionCacheGuarded(ctx, String(sessionId))
  for (const child of subagents) {
    if (!deletedSubagentIdSet.has(String(child.sessionId))) continue
    await invalidateProjectionCacheGuarded(ctx, String(child.sessionId))
  }

  ctx.emit('api-session/removed', sessionId)
  for (const child of subagents) {
    if (!deletedSubagentIdSet.has(String(child.sessionId))) continue
    ctx.emit('api-session/removed', child.sessionId)
  }
  return { ok: true, deleted: true, workspaceIds: action.workspaceIds, subagentIds: deletedSubagentIds }
}
