/** 只读视图的 DTO 组装：GET /list 的归档树与 GET /strays 的游离会话清单。 */

import { basename } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import { SessionId, type SessionHeader } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-workspace'
import {
  buildSessionTree, livingChildIds, straySessionIds, type HeaderFactsStore, type SessionTreeNode,
} from '../archive.js'
import type { ArchiveTreeNode, ListResponse, StraySessionItem, StraysResponse } from '../contract.js'
import { readArchivedIds, workspaceIndexFor } from './archive-set.js'
import { assertSessionLocationApi } from './gates.js'
import { treeHeaderOf, treeIds, type HeaderFacts } from './headers.js'
import { readStrayBlankness, sessionFacts } from './projection.js'
import { sessionDirectoryFor } from './session-files.js'
import { subagentLabels, titlesFor } from './titles.js'

/** GET /list：归档区父子树（标题三档 + 子会话标签，展示事实取官方投影）。 */
export async function archiveTreePayload(
  ctx: Context,
  headerFacts: HeaderFactsStore<HeaderFacts>,
): Promise<ListResponse> {
  const { headers, sizes } = await headerFacts.get()
  const byId = new Map(headers.map(header => [String(header.id), header]))
  const archivedIds = new Set((await readArchivedIds(ctx)).map(String))
  const archivedHeaders = headers.filter(header => archivedIds.has(String(header.id)))
  const tree = buildSessionTree(archivedHeaders.map(treeHeaderOf))
  const ids = treeIds(tree)
  const workspaceIds = workspaceIndexFor(ctx.workspaceRegistry.list())
  // 标题三档（live 投影 → 冷缓存 → 有界折叠兜底），不再整树全日志折叠。
  const treeHeaders = ids
    .map(id => byId.get(id))
    .filter((header): header is SessionHeader => header !== undefined)
  const titles = await titlesFor(ctx, treeHeaders, header => header.id)
  // 子会话标签走官方 subagent 投影（标题单元对种子会话取到父消息，2026-09-02 实测）。
  const childHeaders = treeHeaders.filter(header => header.origin === 'subagent')
  const childLabels = childHeaders.length > 0
    ? await subagentLabels(ctx, childHeaders)
    : new Map<string, string>()
  const nodeOf = (node: SessionTreeNode): ArchiveTreeNode => {
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
  return { tree: tree.map(nodeOf) }
}

/** GET /strays：不在归档集、也不挂任何工作区的会话（有父的子会话跟随父，不单独出现）。 */
export async function strayItemsPayload(
  ctx: Context,
  headerFacts: HeaderFactsStore<HeaderFacts>,
): Promise<StraysResponse> {
  const { headers, sizes } = await headerFacts.get()
  const archivedIds = await readArchivedIds(ctx)
  const attachedIds = ctx.workspaceRegistry.list().flatMap(workspace => workspace.sessionIds.map(id => String(id)))
  // 有父的子会话跟随父、不单独出现在游离区；孤儿子会话（父不在）按顶层对待并打 orphan 标。
  const children = livingChildIds(headers.map(treeHeaderOf))
  const strayIds = straySessionIds(
    headers.map(header => String(header.id)),
    archivedIds.map(id => String(id)),
    attachedIds,
  ).filter(id => !children.has(id))
  // 先取游离 header 集，标题/子标签批量三档（缓存优先 + 有界折叠），不再逐会话串行全日志折叠。
  // 审计（host.ts 旧 :1013 的 O(K·S)）：成员判定先建一次 Set，避免逐 header 对 strayIds 做线性 includes。
  const strayIdSet = new Set(strayIds)
  const strayHeaders = headers.filter(header => strayIdSet.has(String(header.id)))
  const titles = await titlesFor(ctx, strayHeaders, header => header.id)
  const labelHeaders = strayHeaders.filter(header => header.origin === 'subagent')
  const childLabels = labelHeaders.length > 0
    ? await subagentLabels(ctx, labelHeaders)
    : new Map<string, string>()
  const items: StraySessionItem[] = []
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
      blank: readStrayBlankness(ctx, String(sessionId)),
      orphan: header.origin === 'subagent',
      live: ctx.sessions.get(sessionId) !== undefined,
      running: ctx.agents.get(sessionId)?.status === 'running',
      backendSupported: location !== undefined && sessionDirectoryFor(location) !== undefined,
    })
  }
  return { items }
}
