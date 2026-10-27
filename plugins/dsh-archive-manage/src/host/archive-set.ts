/**
 * 归档集 / 工作区记账：读改写走官方写串行链；父子对齐、幽灵清扫与 unarchive 通知在此。
 * 归档集是官方 WorkspaceRegistry 的公开状态，写入只经 enqueueOperation + requireState + setState。
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import { SessionId, type SessionHeader } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-query'
import { WorkspaceId, type Workspace, type WorkspaceDomainState } from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-workspace'
import {
  archiveAlignmentForChildren, collectSubtreeIds, type HeaderFactsStore,
} from '../archive.js'
import type { ArchiveResponse, UnarchiveResponse } from '../contract.js'
import type { RegistryMutationSurface } from './gates.js'
import type { HeaderFacts } from './headers.js'
import { treeHeaderOf } from './headers.js'
import type {} from './events.js'
import { ArchiveError } from './http.js'
import { readStrayBlankness } from './projection.js'

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

export async function detachWorkspaceAccounting(ctx: Context, sessionId: SessionId): Promise<void> {
  for (const workspace of ctx.workspaceRegistry.list()) {
    if (workspace.sessionIds.includes(sessionId)) {
      await workspace.detachSession(sessionId)
    }
  }
}

export async function attachWorkspaceAccounting(ctx: Context, sessionId: SessionId, workspaceIds: readonly string[]): Promise<void> {
  for (const id of workspaceIds) {
    const workspace = ctx.workspaceRegistry.get(WorkspaceId(id))
    if (workspace !== undefined) await workspace.attachSession(sessionId)
  }
}

/** 读归档集：官方公开 getter（通道迁移后内存态与域恒同步，无需再直读域）。 */
export async function readArchivedIds(ctx: Context): Promise<SessionId[]> {
  return [...ctx.workspaceRegistry.archivedSessionIds]
}

/**
 * 归档集读改写：挂官方 enqueueOperation 串行链，链内 requireState → 计算新集合 →
 * setState（官方持久化写：域 + 内存态一步同步）。update 返回同一引用或内容逐项一致视为无变化
 * （removeArchivedId 的 filter 恒返回新数组，内容比较才能让「不在集合内」真正零写入、零事件噪音）。
 */
export function mutateArchivedSet(surface: RegistryMutationSurface, update: (ids: readonly SessionId[]) => readonly SessionId[]): Promise<void> {
  return surface.enqueueOperation(async () => {
    const state: WorkspaceDomainState = surface.requireState()
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
export async function addArchivedId(surface: RegistryMutationSurface, sessionId: SessionId): Promise<void> {
  await mutateArchivedSet(surface, ids => ids.some(id => String(id) === String(sessionId)) ? ids : [...ids, sessionId])
}

/**
 * 父子归档对齐（状态不变量：子镜像父）：
 * - 「父已归档而子未归档」→ 子补进归档集；「父未归档而子已归档」→ 子移出。
 * - 触发：启动 + 官方 workspace 域写入事件（domain/changed）+ 面板打开惰性兜底；幂等。
 * - headers 经 header 事实缓存取（缓存层单飞/TTL/写穿失效），
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

/**
 * 启动清扫：归档集里不在持久化中的幽灵 id 清理掉（历史遗留防御——旧版本直写时代可能已
 * 产生幽灵条目；通道迁移后不再产生新幽灵，保留一次性防御）。
 * headers 经 header 事实缓存取，与其余启动读取共享同一次扫盘。
 */
export async function sweepGhostArchivedIds(
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
 * headers 经 header 事实缓存取，与 /list /strays 共享单飞，不单独扫盘。
 */
async function emitSessionAdded(ctx: Context, sessionId: SessionId, headerFacts: HeaderFactsStore<HeaderFacts>): Promise<void> {
  try {
    const { headers } = await headerFacts.get()
    const header = headers.find(candidate => String(candidate.id) === String(sessionId))
    if (header === undefined) return
    // rc.1 起 SessionSummary 新增必填 `agentAvailable`（该会话当前是否持有 live Agent，
    // 见 `api/session-controller/src/types.ts:177-188`）：与官方语义一致，用 agents 注册表判定。
    ctx.emit('api-session/added', {
      ...addedSummaryFor(header, readStrayBlankness(ctx, String(sessionId))),
      agentAvailable: ctx.agents.get(sessionId) !== undefined,
    })
  } catch (error) {
    ctx.logger.warn(`dsh-archive-manage: api-session/added 通知失败（${String(sessionId)}）：${error instanceof Error ? error.message : String(error)}`)
  }
}

/** 取消归档：只动归档集、不碰文件（live 会话同样可取消）；随后补发「回到列表」通知。 */
export async function unarchiveSession(
  ctx: Context,
  surface: RegistryMutationSurface,
  headerFacts: HeaderFactsStore<HeaderFacts>,
  sessionId: SessionId,
): Promise<UnarchiveResponse> {
  await removeArchivedId(surface, sessionId)
  await emitSessionAdded(ctx, sessionId, headerFacts)
  return { ok: true }
}

/** 归档以父为单位：父 + 全部有父的子会话一并进归档集（单写链原子）。只服务游离 / 孤儿子会话。 */
export async function archiveSessionSubtree(
  surface: RegistryMutationSurface,
  headerFacts: HeaderFactsStore<HeaderFacts>,
  rootId: string,
): Promise<ArchiveResponse> {
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
  return { ok: true, archivedIds: subtree }
}
