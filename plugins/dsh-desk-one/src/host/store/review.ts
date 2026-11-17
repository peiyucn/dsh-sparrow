

import { randomUUID } from 'node:crypto'
import { DESK_NODE_SCHEMA, NOTEBOOK_MAX_DRAFTS, NOTEBOOK_MAX_REVIEW_SESSIONS } from '../../constants.js'
import type { DraftAnnotation, ReviewRecord, ReviewSessionMarker } from '../../notebook-contract.js'
import type { StoreCore } from './core.js'


function reviewSessionId(sessionId: string): string {
  return `review_session_${sessionId}`
}


export interface MarkReviewSessionInput {
  readonly sessionId: string
  readonly workspaceId?: string
  readonly fileId?: string
}


export interface CreateReviewRecordInput {
  readonly sessionId: string
  readonly workspaceId?: string
  readonly fileId: string
  readonly fileTitle: string
  readonly pathSnapshot: string
  readonly annotations: readonly DraftAnnotation[]
}

export class ReviewRepository {
  constructor(private readonly core: StoreCore) {}


  listReviewSessions(): ReviewSessionMarker[] {
    return this.core.allNodes()
      .filter((node): node is ReviewSessionMarker => node.kind === 'review-session')
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, NOTEBOOK_MAX_REVIEW_SESSIONS)
  }


  async markReviewSession(input: MarkReviewSessionInput): Promise<ReviewSessionMarker> {
    const id = reviewSessionId(input.sessionId)
    const now = new Date().toISOString()
    const existing = this.core.nodes.get(id)
    if (existing?.kind === 'review-session') {
      return await this.core.nodes.update(id, current => current.kind === 'review-session'
        ? {
            ...current,
            ...input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId },
            ...input.fileId === undefined || current.fileId !== undefined
              ? {}
              : { fileId: input.fileId },
            updatedAt: now,
            revision: current.revision + 1,
          }
        : current) as ReviewSessionMarker
    }
    const marker: ReviewSessionMarker = {
      id,
      kind: 'review-session',
      schema: DESK_NODE_SCHEMA,
      sessionId: input.sessionId,
      ...input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId },
      ...input.fileId === undefined ? {} : { fileId: input.fileId },
      createdAt: now,
      updatedAt: now,
      revision: 1,
    }
    await this.core.nodes.put(id, marker)
    await this.pruneReviewSessions()
    return marker
  }


  private async pruneReviewSessions(): Promise<void> {
    const markers = this.core.allNodes().filter((node): node is ReviewSessionMarker => node.kind === 'review-session')
    if (markers.length <= NOTEBOOK_MAX_REVIEW_SESSIONS) return
    markers.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    for (const marker of markers.slice(0, markers.length - NOTEBOOK_MAX_REVIEW_SESSIONS)) {
      await this.core.nodes.delete(marker.id)
    }
  }


  async createReviewRecord(input: CreateReviewRecordInput): Promise<ReviewRecord> {
    const annotations = input.annotations.slice(0, NOTEBOOK_MAX_DRAFTS)
    const record: ReviewRecord = {
      id: `review_record_${randomUUID()}`,
      kind: 'review-record',
      schema: DESK_NODE_SCHEMA,
      sessionId: input.sessionId,
      ...input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId },
      fileId: input.fileId,
      fileTitle: input.fileTitle,
      pathSnapshot: input.pathSnapshot,
      annotations,
      bytes: Buffer.byteLength(JSON.stringify(annotations), 'utf8'),
      createdAt: new Date().toISOString(),
    }
    await this.core.nodes.put(record.id, record)
    return record
  }


  listReviewRecords(): ReviewRecord[] {
    return this.core.allNodes()
      .filter((node): node is ReviewRecord => node.kind === 'review-record')
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }


  async deleteReviewRecord(id: string): Promise<void> {
    await this.core.nodes.delete(id)
  }
}
