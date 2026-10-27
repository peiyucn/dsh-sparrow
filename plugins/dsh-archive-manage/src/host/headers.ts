/** header 事实缓存：双形状读取 + TTL 单飞 store，以及 host 树结构所需的 header 投影。 */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionHeader } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import {
  createHeaderFactsStore, type HeaderFactsStore, type SessionTreeHeader, type SessionTreeNode,
} from '../archive.js'
import { HEADER_CACHE_TTL_MS } from '../constants.js'

/** header 事实缓存承载类型：全量 header + 快照 size 映射。 */
export type HeaderFacts = { headers: SessionHeader[]; sizes: Map<string, number> }

/**
 * sessionPersistence.list() 双形状兼容读取：
 * - npm 0.1.2-alpha.5 及更早：直接返回 SessionHeader[]；
 * - alpha.5 发布后的 master（2026-09-02 会话持久化重构）：返回 Snapshot[]（{ header, revision, ... }）。
 * 按元素是否携带 header 字段分流，统一返回 SessionHeader[]（见 AGENTS 插件私有 seam 特例），
 * 并顺带收集快照形状才有的 sizeBytes。
 */
async function storedHeaderFacts(ctx: Context): Promise<HeaderFacts> {
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

/** header 事实缓存（单飞 + TTL）。写穿失效由 startup 的事件监听与写路由负责。 */
export function createHeaderStore(ctx: Context): HeaderFactsStore<HeaderFacts> {
  return createHeaderFactsStore(() => storedHeaderFacts(ctx), HEADER_CACHE_TTL_MS)
}

/** SessionHeader → 纯逻辑树结构。 */
export function treeHeaderOf(header: SessionHeader): SessionTreeHeader {
  return {
    id: String(header.id),
    createdAt: header.createdAt,
    ...header.parentSession === undefined ? {} : { parentSession: String(header.parentSession) },
    ...header.origin === 'subagent' ? { origin: 'subagent' as const } : {},
  }
}

/** 树内全部节点 id（前序遍历，供批量标题读取）。 */
export function treeIds(nodes: readonly SessionTreeNode[]): string[] {
  const out: string[] = []
  for (const node of nodes) {
    out.push(node.header.id)
    out.push(...treeIds(node.children))
  }
  return out
}
