/** Notebook repository: library config, file identities, draft boxes and review-round baselines. */

import { randomUUID } from 'node:crypto'
import {
  DESK_NODE_SCHEMA, NOTEBOOK_BASELINE_MAX_CHARS, NOTEBOOK_CONFIG_ID, NOTEBOOK_MAX_DRAFTS, NOTEBOOK_MAX_REVIEW_BASELINES,
} from '../../constants.js'
import { DeskModelError } from '../../model.js'
import type { DeskNotebookConfig, DraftAnnotation, NoteBaseline, NoteDraft, NoteFileRef } from '../../notebook-contract.js'
import type { StoreCore } from './core.js'

/** Deterministic draft-box id: one draft box per file identity. */
function draftId(fileId: string): string {
  return `note_draft_${fileId}`
}

function baselineId(sessionId: string): string {
  return `note_baseline_${sessionId}`
}

/** Input of `ensureNoteFile`: one path inside the library root plus its content hash. */
export interface EnsureNoteFileInput {
  readonly rootPath: string
  readonly path: string
  readonly hash: string
}

/** Input of `saveNoteDraft`: one bounded draft box with optimistic concurrency. */
export interface SaveNoteDraftInput {
  readonly rootPath: string
  readonly path: string
  readonly fileId: string
  readonly drafts: readonly DraftAnnotation[]
  /** Revision the caller last saw; when given, a mismatch fails instead of overwriting. */
  readonly expectedRevision?: number
}

/** Input of `saveNoteBaseline`: one review round's baseline body. */
export interface SaveNoteBaselineInput {
  readonly rootPath: string
  readonly sessionId: string
  readonly fileId: string
  readonly body: string
  readonly at: string
}

export class NotebookRepository {
  constructor(private readonly core: StoreCore) {}

  /** The configured notes root, if any. */
  getNotebookConfig(): DeskNotebookConfig | undefined {
    const node = this.core.nodes.get(NOTEBOOK_CONFIG_ID)
    return node?.kind === 'notebook-config' ? node : undefined
  }

  /** Point the library at one absolute folder (idempotent on the single record). */
  async saveNotebookRoot(rootPath: string): Promise<DeskNotebookConfig> {
    const now = new Date().toISOString()
    const existing = this.getNotebookConfig()
    if (existing === undefined) {
      const record: DeskNotebookConfig = {
        id: NOTEBOOK_CONFIG_ID,
        kind: 'notebook-config',
        schema: DESK_NODE_SCHEMA,
        rootPath,
        createdAt: now,
        updatedAt: now,
        revision: 1,
      }
      await this.core.nodes.put(record.id, record)
      return record
    }
    if (existing.rootPath === rootPath) return existing
    return await this.core.nodes.update(NOTEBOOK_CONFIG_ID, current => current.kind === 'notebook-config'
      ? { ...current, rootPath, updatedAt: now, revision: current.revision + 1 }
      : current) as DeskNotebookConfig
  }

  /** One file identity by id. */
  getNoteFile(id: string): NoteFileRef | undefined {
    const node = this.core.nodes.get(id)
    return node?.kind === 'note-file' ? node : undefined
  }

  /** All assigned file identities. */
  listNoteFiles(): NoteFileRef[] {
    return this.core.allNodes().filter((node): node is NoteFileRef => node.kind === 'note-file')
  }

  /** Resolve or lazily assign one file identity for (rootPath, path). */
  async ensureNoteFile(input: EnsureNoteFileInput): Promise<NoteFileRef> {
    const now = new Date().toISOString()
    const existing = this.listNoteFiles().find(node => node.rootPath === input.rootPath && node.path === input.path)
    if (existing !== undefined) {
      if (existing.hash === input.hash) return existing
      return await this.core.nodes.update(existing.id, current => current.kind === 'note-file'
        ? { ...current, hash: input.hash, updatedAt: now, revision: current.revision + 1 }
        : current) as NoteFileRef
    }
    const record: NoteFileRef = {
      id: `note_file_${randomUUID()}`,
      kind: 'note-file',
      schema: DESK_NODE_SCHEMA,
      rootPath: input.rootPath,
      path: input.path,
      hash: input.hash,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    }
    await this.core.nodes.put(record.id, record)
    return record
  }

  /** Re-point one file identity after a rename/move. */
  async updateNoteFilePath(id: string, path: string, hash: string): Promise<NoteFileRef> {
    const now = new Date().toISOString()
    return await this.core.nodes.update(id, current => current.kind === 'note-file'
      ? { ...current, path, hash, updatedAt: now, revision: current.revision + 1 }
      : current) as NoteFileRef
  }

  /** One file draft box. */
  getNoteDraft(fileId: string): NoteDraft | undefined {
    const node = this.core.nodes.get(draftId(fileId))
    return node?.kind === 'note-draft' && node.fileId === fileId ? node : undefined
  }

  /** All files with unsaved annotations. */
  listNoteDrafts(): NoteDraft[] {
    return this.core.allNodes().filter((node): node is NoteDraft => node.kind === 'note-draft' && node.fileId !== undefined)
  }

  /**
   * Replace one file draft box (bounded; drafts are the user intent, not review state).
   * An empty batch deletes the box: a submitted review must not leave a "has drafts" shell that
   * the entry page would count and list while the review tab shows nothing.
   *
   * The revision guard is re-checked **inside** the storage write callback: two windows saving the
   * same file both read the same `existing` snapshot, so a guard made only before the write would
   * let the later write silently overwrite the earlier one instead of reporting the conflict.
   */
  async saveNoteDraft(input: SaveNoteDraftInput): Promise<NoteDraft | null> {
    const now = new Date().toISOString()
    const id = draftId(input.fileId)
    const drafts = input.drafts.slice(0, NOTEBOOK_MAX_DRAFTS)
    const existing = this.getNoteDraft(input.fileId)
    const assertRevision = (current: number): void => {
      if (input.expectedRevision !== undefined && input.expectedRevision !== current) {
        throw new DeskModelError('REVISION_CONFLICT', '批注草稿已被其他窗口更新，请刷新后重试')
      }
    }
    // Fast guard for the create / delete branches; the update branch re-checks it atomically below.
    assertRevision(existing?.revision ?? 0)
    if (drafts.length === 0) {
      if (existing !== undefined) await this.core.nodes.delete(id)
      return null
    }
    if (existing === undefined) {
      const record: NoteDraft = {
        id,
        kind: 'note-draft',
        schema: DESK_NODE_SCHEMA,
        rootPath: input.rootPath,
        path: input.path,
        fileId: input.fileId,
        drafts,
        createdAt: now,
        updatedAt: now,
        revision: 1,
      }
      await this.core.nodes.put(record.id, record)
      return record
    }
    return await this.core.nodes.update(id, current => {
      if (current.kind !== 'note-draft') return current
      // Atomic guard: the snapshot above may be stale once the serialized write chain reaches us.
      assertRevision(current.revision)
      return { ...current, rootPath: input.rootPath, path: input.path, drafts, updatedAt: now, revision: current.revision + 1 }
    }) as NoteDraft
  }

  /** One review session's round baseline. */
  getNoteBaseline(sessionId: string): NoteBaseline | undefined {
    const node = this.core.nodes.get(baselineId(sessionId))
    return node?.kind === 'note-baseline' && node.sessionId === sessionId ? node : undefined
  }

  /** Round baselines newest first (bounded by the storage cap). */
  listNoteBaselines(): NoteBaseline[] {
    return this.core.allNodes()
      .filter((node): node is NoteBaseline => node.kind === 'note-baseline' && node.sessionId !== undefined)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, NOTEBOOK_MAX_REVIEW_BASELINES)
  }

  /**
   * Store or replace one file's review baseline. Oversized bodies delete the stored value so a
   * huge file cannot bloat the storage domain; the tab keeps the in-memory baseline.
   */
  async saveNoteBaseline(input: SaveNoteBaselineInput): Promise<NoteBaseline | null> {
    const id = baselineId(input.sessionId)
    const existing = this.getNoteBaseline(input.sessionId)
    if (input.body.length > NOTEBOOK_BASELINE_MAX_CHARS) {
      if (existing !== undefined) await this.core.nodes.delete(id)
      return null
    }
    const now = new Date().toISOString()
    if (existing === undefined) {
      const record: NoteBaseline = {
        id,
        kind: 'note-baseline',
        schema: DESK_NODE_SCHEMA,
        rootPath: input.rootPath,
        sessionId: input.sessionId,
        fileId: input.fileId,
        body: input.body,
        at: input.at,
        createdAt: now,
        updatedAt: now,
        revision: 1,
      }
      await this.core.nodes.put(record.id, record)
      await this.pruneNoteBaselines()
      return record
    }
    return await this.core.nodes.update(id, current => current.kind === 'note-baseline'
      ? {
          ...current,
          rootPath: input.rootPath,
          // The note identity is authoritative per save: a Session reused for another note must not
          // keep serving the previous note's body as this round's baseline.
          fileId: input.fileId,
          body: input.body,
          at: input.at,
          updatedAt: now,
          revision: current.revision + 1,
        }
      : current) as NoteBaseline
  }

  /** Delete the oldest round baselines beyond the cap. */
  private async pruneNoteBaselines(): Promise<void> {
    const baselines = this.core.allNodes().filter((node): node is NoteBaseline => node.kind === 'note-baseline' && node.sessionId !== undefined)
    if (baselines.length <= NOTEBOOK_MAX_REVIEW_BASELINES) return
    baselines.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    for (const baseline of baselines.slice(0, baselines.length - NOTEBOOK_MAX_REVIEW_BASELINES)) {
      await this.core.nodes.delete(baseline.id)
    }
  }
}
