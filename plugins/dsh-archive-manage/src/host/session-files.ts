/**
 * 会话目录的文件级操作：定位、占用守卫、子会话目标收集，以及移入回收站 / 彻底删除的整棵搬运。
 * 只认已知的「单会话目录」后端（jsonl）；后端不提供目录时由调用方降级为 501。
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
} from '../archive.js'
import { unsupportedStoredFormatReason } from '../compat.js'
import { ENOENT, SIDECAR_VERSION, TRASH_SIDECAR } from '../constants.js'
import type { DeleteMutationResponse, TrashMutationResponse } from '../contract.js'
import { detachWorkspaceAccounting, removeArchivedIds, workspaceIndexFor } from './archive-set.js'
import type { RegistryMutationSurface } from './gates.js'
import { assertSessionLocationApi } from './gates.js'
import type { HeaderFacts } from './headers.js'
import { treeHeaderOf } from './headers.js'
import { ArchiveError } from './http.js'
import { invalidateProjectionCacheGuarded } from './projection.js'
import { ensureTrashRoot, resolveTrashDir, safeDirName } from './trash.js'
import { readTitle } from './titles.js'

/**
 * 活动会话防护：本次 dsh 运行中驻留（未释放）的会话无法被插件卸载——AgentHandle.dispose
 * 是官方 session-controller 持有且被丢弃的 teardown 能力，dsh 无公开「结束会话」
 * API（查证 0.1.2-alpha.1 源码：session / agent 常驻 live store 至进程退出），
 * 硬移目录会被后续回写重建幽灵目录。面板把这类会话在归档区内分组置灰，host 侧兜底拒绝。
 */
export function ensureSessionNotLive(ctx: Context, sessionId: SessionId): void {
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

/** 宿主真值格式门（请求期）：header 由宿主给出，不受「插件解析到旧版官方包」影响。
 *  不支持即拒绝——本插件的操作会移动/删除会话目录，认错格式的代价是丢数据。 */
export function assertHeaderFormatSupported(header: SessionHeader): void {
  const reason = unsupportedStoredFormatReason([header])
  if (reason === undefined) return
  throw new ArchiveError('BACKEND_UNSUPPORTED', `${reason}；已拒绝本次操作（升级本插件后自动恢复）`, 501)
}

/** 找出某个父会话下的**全部后代** subagent 会话（任意深度）；任一会话仍被占用时不处理任何文件。
 *  子代理自身也能再派子代理（官方 header 有 `delegationDepth`，subagent 工具可嵌套），故不能只取
 *  直接子会话：深度 ≥2 的后代目录留在磁盘上，父已缺位后它们要么以孤儿根浮现在归档区根级、
 *  要么落进游离区（2026-09-12 实测：两个孙会话在其祖父会话入回收站后掉出来，用户只能逐个再操作）。
 *  headers 经 header 事实缓存取，与同请求的主 header 查表口径一致。 */
export async function listSubagentTargets(
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

export interface SubagentTarget {
  readonly sessionId: SessionId
  readonly header: SessionHeader
  readonly dir: string
}

/** 移入回收站所需的父会话上下文（路由已完成格式门、占用守卫与后端检查）。 */
export interface SessionMoveAction {
  readonly sessionId: SessionId
  readonly sessionDir: string
  readonly title: string
  readonly subagents: readonly SubagentTarget[]
  readonly workspaceIds: readonly string[]
}

/** 彻底删除所需的父会话上下文。 */
export interface SessionDeleteAction {
  readonly sessionId: SessionId
  readonly sessionDir: string
  readonly subagents: readonly SubagentTarget[]
  readonly workspaceIds: readonly string[]
}

/**
 * 把父会话 + 全部后代目录搬进回收站：先搬父（ENOENT 明确报错），再逐个搬子目录（幽灵子目录跳过），
 * 任何失败整单回滚；成功后写 sidecar、清工作区记账与归档集、补发 removed 事件。
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
    // 根目录缺失（陈旧 header 缓存 / 已被别的操作搬走或手工删过）：没有东西可搬进回收站。
    // 有意**不**像后代那样静默跳过——回收站条目一旦只有 sidecar 没有日志，还原就会造出一个
    // 空会话目录，比直接报错更糟。给一条人能看懂的提示，用户可改用「彻底删除」（它宽容 ENOENT）。
    if ((error as NodeJS.ErrnoException)?.code === ENOENT) {
      throw new ArchiveError('UNKNOWN_SESSION', '会话目录不在磁盘上（可能已被移走或删除）：没有可移入回收站的内容，请刷新面板', 404)
    }
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
          // 记父子链：回收站区据此还原任意深度的层级。深度 ≥2 的后代父是
          // 中间层子会话，不记就只能平铺展示（2026-09-12 owner 实测「回收站里显示不了 >2 的树」）。
          ...child.header.parentSession === undefined ? {} : { parentSessionId: String(child.header.parentSession) },
        })
      }
    } catch (error) {
      await rollbackMoves()
      // 回滚成功后 trashDir 已移回原处，清掉残留的空 subagents/ 子目录（非空时保留，避免误删未移回的会话）。
      await rmdir(join(action.sessionDir, 'subagents')).catch(() => undefined)
      throw new ArchiveError('IO_ERROR', `移动 subagent 会话目录失败（已回滚）：${error instanceof Error ? error.message : String(error)}`, 500)
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
  const subagentIds = subagents.map(child => String(child.sessionId))
  try {
    await removeArchivedIds(surface, archivedIdsToRemove(String(sessionId), subagentIds))
  } catch (cleanupError) {
    ctx.logger.warn(`dsh-archive-manage: 归档集清理失败：${String(cleanupError)}`)
  }
  // 移入回收站不失效投影行：会话身份未变，还原后标题投影依然有效（否则子会话标题退化为
  // 冷读首条用户消息 = 委派指令文本；2026-09-02 实测。
  // 通知会话列表消费者移除条目（官方公开事件；会话目录已移走）。
  ctx.emit('api-session/removed', sessionId)
  for (const child of subagents) {
    ctx.emit('api-session/removed', child.sessionId)
  }
  return { ok: true, trashId, workspaceIds: action.workspaceIds, subagentIds }
}

/** 彻底删除父会话 + 全部后代目录；子目录删除是 best-effort，只有真正消失的才摘归档集与投影行。 */
export async function deleteSessionTree(
  ctx: Context,
  surface: RegistryMutationSurface,
  action: SessionDeleteAction,
): Promise<DeleteMutationResponse> {
  const { sessionId, subagents } = action
  // force:true 只吞 ENOENT：根目录本就不在磁盘上同样算「已消失」（与子会话同一条道理，
  // 见下方注释），否则幽灵会话会永久留在归档面板、面板里再也清不掉（审计 S4）。
  await rm(action.sessionDir, { recursive: true, force: true })
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
  await invalidateProjectionCacheGuarded(ctx, String(sessionId))
  for (const child of subagents) {
    if (!deletedSubagentIdSet.has(String(child.sessionId))) continue
    await invalidateProjectionCacheGuarded(ctx, String(child.sessionId))
  }
  // 通知会话列表消费者移除条目（官方公开事件；会话目录已删除）。
  ctx.emit('api-session/removed', sessionId)
  for (const child of subagents) {
    if (!deletedSubagentIdSet.has(String(child.sessionId))) continue
    ctx.emit('api-session/removed', child.sessionId)
  }
  return { ok: true, deleted: true, workspaceIds: action.workspaceIds, subagentIds: deletedSubagentIds }
}
