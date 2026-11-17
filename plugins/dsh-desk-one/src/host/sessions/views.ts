

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
} from './archive.js'
import type { ArchiveTreeNode, ListResponse, StraySessionItem, StraysResponse } from '../../session-admin.js'
import { readArchivedIds, workspaceIndexFor } from './archive-set.js'
import { sortByRecentActivity, sortTreeByRecentActivity } from './activity-order.js'
import { treeHeaderOf, treeIds, type HeaderFacts } from './headers.js'
import { readStrayBlankness, sessionFacts } from './projection.js'
import { sessionDirectoryFromFacts } from './session-files.js'
import { subagentLabels, titlesFor } from './titles.js'


export async function archiveTreePayload(
  ctx: Context,
  headerFacts: HeaderFactsStore<HeaderFacts>,
): Promise<ListResponse> {
  const stored = await headerFacts.get()
  const { headers, sizes } = stored
  const byId = new Map(headers.map(header => [String(header.id), header]))
  const archivedIds = new Set((await readArchivedIds(ctx)).map(String))
  const archivedHeaders = headers.filter(header => archivedIds.has(String(header.id)))
  const tree = buildSessionTree(archivedHeaders.map(treeHeaderOf))
  const ids = treeIds(tree)
  const workspaceIds = workspaceIndexFor(ctx.workspaceRegistry.list())

  const treeHeaders = ids
    .map(id => byId.get(id))
    .filter((header): header is SessionHeader => header !== undefined)
  const titles = await titlesFor(ctx, treeHeaders, header => header.id)

  const childHeaders = treeHeaders.filter(header => header.origin === 'subagent')
  const childLabels = childHeaders.length > 0
    ? await subagentLabels(ctx, childHeaders)
    : new Map<string, string>()
  const nodeOf = (node: SessionTreeNode): ArchiveTreeNode => {
    const header = byId.get(node.header.id)
    const sessionId = SessionId(node.header.id)
    const liveSession = ctx.sessions.get(sessionId)
    const agent = ctx.agents.get(sessionId)
    const facts = header === undefined ? undefined : sessionFacts(ctx, node.header.id)
    const createdAt = header?.createdAt ?? node.header.createdAt
    const lastActiveAt = facts?.lastPromptAt
    return {
      sessionId: node.header.id,
      title: childLabels.get(node.header.id) ?? titles.get(node.header.id) ?? sessionId,
      updatedAt: lastActiveAt ?? createdAt,
      createdAt,
      project: header?.cwd === undefined ? undefined : basename(header.cwd),
      turns: facts?.turns,
      tokens: facts?.decodeTokens,
      lastActiveAt,
      sizeBytes: sizes.get(node.header.id),
      live: liveSession !== undefined,
      running: agent?.status === 'running',
      backendSupported: sessionDirectoryFromFacts(stored, node.header.id) !== undefined,
      workspaceIds: header === undefined ? [] : workspaceIds.get(String(sessionId)) ?? [],
      orphan: header !== undefined && header.origin === 'subagent'
        && header.parentSession !== undefined && !byId.has(String(header.parentSession)),
      children: node.children.map(nodeOf),
    }
  }
  return { tree: sortTreeByRecentActivity(tree.map(nodeOf)) }
}


export async function strayItemsPayload(
  ctx: Context,
  headerFacts: HeaderFactsStore<HeaderFacts>,
): Promise<StraysResponse> {
  const stored = await headerFacts.get()
  const { headers, sizes } = stored
  const archivedIds = await readArchivedIds(ctx)
  const attachedIds = ctx.workspaceRegistry.list().flatMap(workspace => workspace.sessionIds.map(id => String(id)))

  const children = livingChildIds(headers.map(treeHeaderOf))
  const strayIds = straySessionIds(
    headers.map(header => String(header.id)),
    archivedIds.map(id => String(id)),
    attachedIds,
  ).filter(id => !children.has(id))


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
    const backendSupported = sessionDirectoryFromFacts(stored, String(header.id)) !== undefined
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
      backendSupported,
    })
  }
  return { items: sortByRecentActivity(items) }
}
