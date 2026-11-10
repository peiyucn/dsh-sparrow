/**
 * File-level operations on session directories: locating them, live-session guards, subagent target collection,
 * and whole-tree moves into the trash or permanent deletion.
 * Only known "one directory per session" backends (jsonl) are supported; when a backend provides no directory,
 * the caller degrades to 501.
 */

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
import { ENOENT, SIDECAR_VERSION, TRASH_SIDECAR } from './constants.js'
import type { DeleteMutationResponse, TrashMutationResponse } from '../../session-admin.js'
import { detachWorkspaceAccounting, removeArchivedIds, workspaceIndexFor } from './archive-set.js'
import type { RegistryMutationSurface } from './gates.js'
import { assertSessionLocationApi } from './gates.js'
import type { HeaderFacts } from './headers.js'
import { treeHeaderOf } from './headers.js'
import { SessionsError } from './errors.js'
import { invalidateProjectionCacheGuarded } from './projection.js'
import { ensureTrashRoot, resolveTrashDir, safeDirName } from './trash.js'
import { readTitle } from './titles.js'

/**
 * Live-session guard: sessions resident (not released) in the current dsh process cannot be unloaded by the plugin —
 * AgentHandle.dispose is teardown capability held and discarded by the official session-controller, and dsh exposes
 * no public "end session" API (verified in 0.1.2-alpha.1 sources: session / agent stay in the live store until process
 * exit). Forcing a directory move would later be undone by write-back recreating a ghost directory. The panel groups
 * and greys out such sessions in the archive view, with a host-side backstop rejection.
 */
export function ensureSessionNotLive(ctx: Context, sessionId: SessionId): void {
  const agent = ctx.agents.get(sessionId)
  // Do not silently cancel a user turn for a generating session: make the user stop generation first.
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

/** Only known "one directory per session" backends (currently jsonl) allow file-level moves / deletes. */
export function sessionDirectoryFor(location: { kind: string; path: string }): string | undefined {
  if (location.kind !== 'jsonl') return undefined
  // Defense against host field drift (audit B1, 2026-09-10): return undefined when path is not a string or is empty,
  // so the caller takes the existing BACKEND_UNSUPPORTED fallback (backendSupported:false / 501) instead of
  // dirname(undefined) throwing through the whole route.
  if (typeof location.path !== 'string' || location.path === '') return undefined
  const dir = dirname(location.path)
  if (!isAbsolute(dir) || dirname(dir) === dir || basename(dir) === '') return undefined
  return dir
}

/** Host-truth format gate (per request): the header comes from the host and is unaffected by the plugin resolving
 *  an old official package. Reject when unsupported — these operations move/delete session directories, and
 *  misidentifying the format costs data. */
export function assertHeaderFormatSupported(header: SessionHeader): void {
  const reason = unsupportedStoredFormatReason([header])
  if (reason === undefined) return
  throw new SessionsError('BACKEND_UNSUPPORTED', `${reason}；已拒绝本次操作（升级本插件后自动恢复）`, 501)
}

/**
 * Find **all descendant** subagent sessions (at any depth) under a parent session; if any session is still live,
 * no files are touched. Subagents can spawn their own subagents (official headers carry `delegationDepth`, and the
 * subagent tool can nest), so direct children are not enough: depth ≥2 descendant directories stay on disk, and
 * once their parent is gone they surface either as orphan roots at the archive root or in the strays area
 * (observed 2026-09-12: two grandchild sessions fell out after their grandparent entered the trash, forcing the
 * user to handle each individually). Headers come from the header facts cache, matching how the primary header
 * for the same request is looked up.
 */
export async function listSubagentTargets(
  ctx: Context,
  parentSessionId: SessionId,
  headerFacts: HeaderFactsStore<HeaderFacts>,
): Promise<SubagentTarget[]> {
  const { headers } = await headerFacts.get()
  const byId = new Map(headers.map(header => [String(header.id), header]))
  // All descendants (BFS, parent before children); ids come from subagentDescendantIds over the same headers,
  // so the lookup cannot miss.
  const descendantIds = subagentDescendantIds(headers.map(treeHeaderOf), String(parentSessionId))
  const targets: SubagentTarget[] = []
  for (const id of descendantIds) {
    const header = byId.get(id)
    // Defensive branch: if the upstream header shape changes, prefer skipping a directory over reading a field
    // on undefined and throwing through the whole route.
    if (header === undefined) continue
    assertHeaderFormatSupported(header)
    const sessionId = SessionId(String(header.id))
    if (ctx.sessions.get(sessionId) !== undefined || ctx.agents.get(sessionId) !== undefined) {
      throw new SessionsError('SESSION_LIVE', `subagent 会话 ${String(sessionId)} 仍被 dsh 进程占用，不能与父会话一起处理`, 409)
    }
    const location = assertSessionLocationApi(ctx.sessionPersistence).locate(header)
    const dir = location === undefined ? undefined : sessionDirectoryFor(location)
    if (dir === undefined) {
      throw new SessionsError('BACKEND_UNSUPPORTED', `subagent 会话 ${String(sessionId)} 的持久化后端不支持文件级处理`, 501)
    }
    targets.push({ sessionId, header, dir })
  }
  return targets
}

export interface SubagentTarget {
  readonly sessionId: SessionId
  readonly header: SessionHeader
  readonly dir: string
}

/** Parent session context needed to move into the trash (the route has already done the format gate, live-session
 *  guard, and backend check). */
export interface SessionMoveAction {
  readonly sessionId: SessionId
  readonly sessionDir: string
  readonly title: string
  readonly subagents: readonly SubagentTarget[]
  readonly workspaceIds: readonly string[]
}

/** Parent session context needed for permanent deletion. */
export interface SessionDeleteAction {
  readonly sessionId: SessionId
  readonly sessionDir: string
  readonly subagents: readonly SubagentTarget[]
  readonly workspaceIds: readonly string[]
}

/**
 * Move the parent session plus all descendant directories into the trash: move the parent first (ENOENT is a hard
 * error), then each child directory (ghost children are skipped); any failure rolls back the whole operation.
 * On success, write the sidecar, clear workspace accounting and the archived set, and emit removed events.
 */
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
        ctx.logger.warn(`dsh-archive-manage: 回滚失败（${move.to} → ${move.from}）：${String(rollbackError)}`)
      }
    }
  }
  try {
    await rename(action.sessionDir, trashDir)
    moved.push({ from: action.sessionDir, to: trashDir })
  } catch (error) {
    // Root directory missing (stale header cache / already moved by another operation or deleted manually):
    // there is nothing to move into the trash. Deliberately do **not** skip it silently the way descendants are
    // skipped — a trash entry with a sidecar but no log would make restore create an empty session directory,
    // which is worse than failing outright. Give a human-readable hint so the user can switch to "delete permanently"
    // (which tolerates ENOENT).
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
          // ENOENT = the directory was never on disk (stale header cache / deleted manually): nothing to move,
          // so skip and continue — same ENOENT policy as the delete path (audit F2). A ghost entry must not roll
          // back the whole operation and leave the user permanently stuck on "this tree cannot enter the trash".
          // It stays in the response/archive cleanup list (the session is gone from disk, so the marker should not
          // remain). Other errors still roll back the whole operation as before.
          if ((error as NodeJS.ErrnoException)?.code === ENOENT) {
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
          // Record the parent-child chain: the trash view uses it to restore hierarchies at any depth. For depth ≥2
          // descendants the parent is an intermediate child session, and without the link they can only be shown
          // flat (owner observed on 2026-09-12 that "trees deeper than 2 do not render in the trash").
          ...child.header.parentSession === undefined ? {} : { parentSessionId: String(child.header.parentSession) },
        })
      }
    } catch (error) {
      await rollbackMoves()
      // After a successful rollback trashDir is back in place; remove the leftover empty subagents/ subdirectory
      // (keep it when non-empty so sessions that were not moved back are not deleted by mistake).
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
  // Detaching workspace accounting is best-effort: the session directory is already moved, and the official
  // workspace projection filters candidates with missing headers and durably prunes them on the next workspace
  // change (rc.1 Workspace.sessionIds contract), so a failure self-heals.
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
  const subagentIds = subagents.map(child => String(child.sessionId))
  try {
    await removeArchivedIds(surface, archivedIdsToRemove(String(sessionId), subagentIds))
  } catch (cleanupError) {
    ctx.logger.warn(`dsh-archive-manage: 归档集清理失败：${String(cleanupError)}`)
  }
  // Moving to the trash does not invalidate projection rows: the session identity is unchanged, so the title
  // projection remains valid after restore (otherwise subagent titles would degrade to the first user message read
  // cold = the delegation instruction text; observed 2026-09-02).
  // Tell session-list consumers to remove the entries (official public event; session directories are gone).
  ctx.emit('api-session/removed', sessionId)
  for (const child of subagents) {
    ctx.emit('api-session/removed', child.sessionId)
  }
  return { ok: true, trashId, workspaceIds: action.workspaceIds, subagentIds }
}

/** Permanently delete the parent session plus all descendant directories; child deletion is best-effort, and only
 *  sessions that actually disappear are removed from the archived set and projection rows. */
export async function deleteSessionTree(
  ctx: Context,
  surface: RegistryMutationSurface,
  action: SessionDeleteAction,
): Promise<DeleteMutationResponse> {
  const { sessionId, subagents } = action
  // force:true swallows only ENOENT: a root directory that was never on disk also counts as "gone" (same
  // reasoning as for child sessions, see below), otherwise a ghost session would remain forever in the archive
  // panel and could never be cleared there (audit S4).
  await rm(action.sessionDir, { recursive: true, force: true })
  // Only child sessions (with all their descendants) that actually disappear from disk count as removed: a failed
  // rm is still on disk, so keep its archive marker and workspace accounting, letting it remain actionable as an
  // orphan root in the archive panel (audit S7).
  const deletedSubagentIds: string[] = []
  for (const child of subagents) {
    try {
      // force:true swallows only ENOENT — a directory that was never on disk also counts as "gone"; otherwise it
      // would be treated as "failed, still on disk" and keep its archive marker forever, becoming an orphan root
      // that can never be deleted (the parent is already gone, so clicking delete again would fail the whole
      // operation at the rm above). Other errors still throw and keep the marker.
      await rm(child.dir, { recursive: true, force: true })
      deletedSubagentIds.push(String(child.sessionId))
    } catch (error) {
      ctx.logger.warn(`dsh-archive-manage: 删除 subagent 会话目录失败（${String(child.sessionId)}），属 best-effort 清理、已跳过并保留归档标记：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const deletedSubagentIdSet = new Set(deletedSubagentIds)
  // Detaching workspace accounting is best-effort (same as moving to the trash: official projection filtering +
  // next-change pruning self-heal).
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
  await invalidateProjectionCacheGuarded(ctx, String(sessionId))
  for (const child of subagents) {
    if (!deletedSubagentIdSet.has(String(child.sessionId))) continue
    await invalidateProjectionCacheGuarded(ctx, String(child.sessionId))
  }
  // Tell session-list consumers to remove the entries (official public event; session directories are deleted).
  ctx.emit('api-session/removed', sessionId)
  for (const child of subagents) {
    if (!deletedSubagentIdSet.has(String(child.sessionId))) continue
    ctx.emit('api-session/removed', child.sessionId)
  }
  return { ok: true, deleted: true, workspaceIds: action.workspaceIds, subagentIds: deletedSubagentIds }
}
