

import { SESSION_INDEX_MISSING_DAYS } from '../../constants.js'
import { createSessionIndexRecord, sessionIndexId, type SessionIndexDraft } from '../sessions/records.js'
import type { DeskSessionIndex } from '../../contract.js'
import type { StoreCore } from './core.js'

export class SessionIndexRepository {
  constructor(private readonly core: StoreCore) {}


  async upsertSessionIndexes(drafts: readonly SessionIndexDraft[]): Promise<{ indexed: number; missing: number }> {
    const now = new Date().toISOString()
    const seen = new Set<string>()
    let indexed = 0
    for (const draft of drafts) {
      const id = sessionIndexId(draft.sessionId)
      seen.add(id)
      const current = this.core.nodes.get(id)
      if (current === undefined) {
        await this.core.nodes.put(id, createSessionIndexRecord(draft, { now }))
        indexed += 1
        continue
      }
      if (current.kind !== 'session') continue
      await this.core.nodes.update(id, (node) => node.kind === 'session'
        ? {
            ...node,
            title: draft.title,
            ...(draft.cwd === undefined ? {} : { cwd: draft.cwd }),
            ...(draft.parentSessionId === undefined ? {} : { parentSessionId: draft.parentSessionId }),
            subagent: draft.subagent,
            running: draft.running,
            availability: draft.availability,
            updatedAt: draft.updatedAt,
            indexedAt: now,
            revision: node.revision + 1,
          }
        : node)
      indexed += 1
    }
    let missing = 0
    const cutoff = Date.now() - SESSION_INDEX_MISSING_DAYS * 86_400_000
    for (const node of this.core.allNodes()) {
      if (node.kind !== 'session' || seen.has(node.id)) continue
      const missingSince = node.missingSince ?? now
      if (Date.parse(missingSince) < cutoff) {
        await this.core.nodes.delete(node.id)
        continue
      }
      missing += 1
      await this.core.nodes.update(node.id, current => current.kind === 'session'
        ? { ...current, availability: 'missing', missingSince, running: false, revision: current.revision + 1 }
        : current)
    }
    return { indexed, missing }
  }

  listSessionIndexes(query?: string, limit?: number): DeskSessionIndex[] {
    const needle = (query ?? '').trim().toLowerCase()
    const all = this.core.allNodes()
      .filter((node): node is DeskSessionIndex => node.kind === 'session' && node.availability !== 'missing')
      .filter(node => needle === ''
        || node.title.toLowerCase().includes(needle)
        || node.sessionId.toLowerCase().includes(needle)
        || (node.cwd ?? '').toLowerCase().includes(needle))
      .sort((left, right) => Number(right.running) - Number(left.running)
        || right.updatedAt - left.updatedAt
        || left.title.localeCompare(right.title))
    const bounded = limit === undefined ? 20 : Math.min(Math.max(0, limit), 100)
    return all.slice(0, bounded)
  }

  findSessionIndex(sessionId: string): DeskSessionIndex | undefined {
    const node = this.core.nodes.get(sessionIndexId(sessionId))
    return node?.kind === 'session' ? node : undefined
  }
}
