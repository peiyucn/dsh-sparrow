/** Session index records: a foreign key + searchable cache, never a copy of session content. */

import type { DeskSessionIndex } from '../../contract.js'

export interface SessionIndexDraft {
  readonly sessionId: string
  readonly title: string
  readonly cwd?: string
  readonly parentSessionId?: string
  readonly subagent: boolean
  readonly running: boolean
  readonly availability: 'available' | 'archived' | 'missing'
  readonly updatedAt: number
}

/** Deterministic id: rebuilding the index must not change the FK target. */
export function sessionIndexId(sessionId: string): string {
  return `session_${sessionId}`
}

export function createSessionIndexRecord(
  draft: SessionIndexDraft,
  meta: { readonly now: string },
): DeskSessionIndex {
  return {
    id: sessionIndexId(draft.sessionId),
    kind: 'session',
    schema: 1,
    sessionId: draft.sessionId,
    title: draft.title,
    ...(draft.cwd === undefined ? {} : { cwd: draft.cwd }),
    ...(draft.parentSessionId === undefined ? {} : { parentSessionId: draft.parentSessionId }),
    subagent: draft.subagent,
    running: draft.running,
    availability: draft.availability,
    updatedAt: draft.updatedAt,
    indexedAt: meta.now,
    createdAt: meta.now,
    revision: 1,
  }
}
