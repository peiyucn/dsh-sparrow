

import type { Context } from '@deepseek-ai/cordis'
import { DomainError, type Domain } from '@deepseek-ai/dsh-storage-domain'
import { DESK_DOMAIN } from '../domain.js'
import { NODES_TABLE, PACKAGE_NAME } from '../../constants.js'
import { DeskModelError } from '../../model.js'
import type { DeskNode, DeskTask } from '../../contract.js'


export type DeskDomain = Domain<typeof DESK_DOMAIN>


export class StoreCore {
  constructor(private readonly domain: DeskDomain) {}


  get nodes() {
    return this.domain.table(NODES_TABLE)
  }

  allNodes(): DeskNode[] {
    return [...this.nodes.entries()].map(([, node]) => node)
  }

  allTasks(): DeskTask[] {
    return this.allNodes().filter((node): node is DeskTask => node.kind === 'task')
  }


  mapMissing(error: unknown, code: 'UNKNOWN_NOTE' | 'UNKNOWN_TASK' | 'UNKNOWN_GROUP', message: string): unknown {
    if (error instanceof DomainError && error.code === 'missing-key') return new DeskModelError(code, message)
    return error
  }


  async purgeLegacyRecords(ctx: Context): Promise<void> {
    const legacyKinds = new Set(['annotation', 'review'])
    const legacy = this.allNodes().filter((node) => {
      const kind = (node as { kind?: string }).kind ?? ''
      if (legacyKinds.has(kind)) return true

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


  close(): Promise<void> {
    return this.domain.close()
  }
}
