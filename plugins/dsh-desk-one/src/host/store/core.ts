/**
 * Shared plumbing for the desk store: the one `nodes` table, kind-narrowed scans, the legacy purge
 * and the domain-error translation every repository reuses.
 *
 * Repositories under `src/host/store/` all work through this context, so storage-domain details
 * (table handle, per-record layout) stay in one place; `store.ts` remains the public facade.
 */

import type { Context } from '@deepseek-ai/cordis'
import { DomainError, type Domain } from '@deepseek-ai/dsh-storage-domain'
import { DESK_DOMAIN } from '../domain.js'
import { NODES_TABLE, PACKAGE_NAME } from '../../constants.js'
import { DeskModelError } from '../../model.js'
import type { DeskNode, DeskTask } from '../../contract.js'

/** Storage domain handle used by every desk repository. */
export type DeskDomain = Domain<typeof DESK_DOMAIN>

/** Shared view of the desk storage domain: the node table plus the scans built on it. */
export class StoreCore {
  constructor(private readonly domain: DeskDomain) {}

  /** The unified node table (all kinds share it; kind is the discriminator). */
  get nodes() {
    return this.domain.table(NODES_TABLE)
  }

  allNodes(): DeskNode[] {
    return [...this.nodes.entries()].map(([, node]) => node)
  }

  allTasks(): DeskTask[] {
    return this.allNodes().filter((node): node is DeskTask => node.kind === 'task')
  }

  /** Translate the domain's missing-key error into the feature-specific 404. */
  mapMissing(error: unknown, code: 'UNKNOWN_NOTE' | 'UNKNOWN_TASK' | 'UNKNOWN_GROUP', message: string): unknown {
    if (error instanceof DomainError && error.code === 'missing-key') return new DeskModelError(code, message)
    return error
  }

  /**
   * Delete records of the withdrawn notebook feature once, after the domain opened.
   *
   * They are accepted by the schema only to keep an upgrade from rejecting the whole domain;
   * notebook and review state live elsewhere now, so these rows have no reader.
   * @param ctx - host context (logging only).
   */
  async purgeLegacyRecords(ctx: Context): Promise<void> {
    const legacyKinds = new Set(['annotation', 'review'])
    const legacy = this.allNodes().filter((node) => {
      const kind = (node as { kind?: string }).kind ?? ''
      if (legacyKinds.has(kind)) return true
      // Draft boxes from the path-keyed design have no file identity and cannot be migrated cheaply.
      return kind === 'note-draft' && (node as { fileId?: string }).fileId === undefined
    })
    if (legacy.length === 0) return
    for (const node of legacy) {
      try {
        await this.nodes.delete(node.id)
      } catch (error) {
        ctx.logger.warn(`${PACKAGE_NAME}: 清理旧笔记功能记录失败（${node.id}）：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    ctx.logger.info(`${PACKAGE_NAME}: 已清理 ${legacy.length} 条旧笔记功能记录`)
  }

  /** Close the storage domain (plugin unload / host shutdown, via the effect). */
  close(): Promise<void> {
    return this.domain.close()
  }
}
