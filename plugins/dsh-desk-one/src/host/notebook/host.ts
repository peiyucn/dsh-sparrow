/**
 * Annotation host: file identity, single-page reads, the draft box, and review history.
 *
 * There is no global "library root" and no user-facing index any more: callers name a registered
 * workspace, and each file identity remembers the workspace root it came from. The only remaining
 * directory scan is the bounded, on-demand one used to follow a renamed file by content hash.
 */

import { readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type {
  NoteDraft, NotebookEntry, NotebookFileResponse, NotebookPageResponse,
  RecordReviewRequest, ReviewHistoryEntry, ReviewRecord,
} from '../../notebook-contract.js'
import { NOTEBOOK_MAX_BYTES, NOTEBOOK_SCAN_TIMEOUT_MS } from '../../constants.js'
import { DeskError } from '../http.js'
import type { DeskStore } from '../store.js'
import { ensureNoteFile } from './files.js'
import { readPage } from './library.js'
import { scanLibrary } from './scan.js'

/** How long one scan is reused before the next request rescans. */
const SCAN_TTL_MS = 30_000
/** How many candidate files a history resolution hashes before giving up. */
const RELOCATE_CANDIDATES = 400
/** Resolve budget for one history request (ms). */
const RELOCATE_BUDGET_MS = 3_000
/** How long one rename-detection conclusion (found or detached) is reused. */
const RELOCATE_TTL_MS = 60_000
/** Upper bound of remembered rename conclusions; one entry per file identity. */
const RELOCATE_CACHE_LIMIT = 500

/** One file's content hash. */
async function hashFile(rootPath: string, relativePath: string): Promise<string | undefined> {
  try {
    const absolute = join(rootPath, ...relativePath.split('/'))
    const info = await stat(absolute)
    if (info.size > NOTEBOOK_MAX_BYTES) return undefined
    const bytes = await readFile(absolute)
    return createHash('sha256').update(bytes).digest('hex')
  } catch {
    return undefined
  }
}

/** Annotation data facade shared by routes. */
export class NotebookHost {
  /** Last successful scan and its root. */
  private cache: { readonly root: string; readonly at: number; readonly entries: readonly NotebookEntry[] } | undefined
  /** In-flight scan (single flight). */
  private pending: Promise<readonly NotebookEntry[]> | undefined
  /** Recent rename-detection outcomes, so a detached history entry is not re-hashed every request. */
  private readonly relocateCache = new Map<string, {
    readonly hash: string
    readonly at: number
    readonly path?: string
  }>()

  /** @param store - unified storage store. */
  constructor(private readonly store: DeskStore) {}

  /** Scan one root on demand, reusing the last scan while it is fresh (rename detection only). */
  private async entries(root: string): Promise<readonly NotebookEntry[]> {
    const now = Date.now()
    if (this.cache !== undefined && this.cache.root === root && now - this.cache.at < SCAN_TTL_MS) {
      return this.cache.entries
    }
    if (this.pending !== undefined) return await this.pending
    const scan = scanLibrary(root, now + NOTEBOOK_SCAN_TIMEOUT_MS).then((entries) => {
      this.cache = { root, at: Date.now(), entries }
      return entries
    }).finally(() => { this.pending = undefined })
    this.pending = scan
    return await scan
  }

  /**
   * Resolve one file under an explicit root (a registered workspace) and read it back.
   *
   * This is the workspace-scoped path used by the annotation entry: the caller names a workspace
   * and a relative path inside it, so no global "library root" is required.
   * @param rootPath - absolute workspace root.
   * @param relativePath - path relative to that workspace root.
   * @returns the file identity plus the renderable page.
   */
  async openAt(rootPath: string, relativePath: string): Promise<{ file: NotebookFileResponse['file']; page: NotebookPageResponse }> {
    const file = await ensureNoteFile(this.store, rootPath, relativePath)
    return { file, page: await readPage(rootPath, relativePath) }
  }

  /**
   * Read one file back by the root recorded with its identity (the file's own workspace).
   * @param fileId - persisted file identity.
   * @returns the file identity plus the renderable page.
   */
  async openById(fileId: string): Promise<{ file: NotebookFileResponse['file']; page: NotebookPageResponse }> {
    const file = this.store.getNoteFile(fileId)
    if (file === undefined) throw new DeskError('UNKNOWN_NOTE', '文件身份不存在', 404)
    return { file, page: await readPage(file.rootPath, file.path) }
  }

  /** Record one submitted review (annotations + file snapshot metadata). */
  async recordReview(input: RecordReviewRequest): Promise<ReviewRecord> {
    const file = this.store.getNoteFile(input.fileId)
    if (file === undefined) throw new DeskError('UNKNOWN_NOTE', '文件身份不存在', 404)
    // The identity remembers its own root, so a review can belong to any workspace.
    const page = await readPage(file.rootPath, file.path)
    return await this.store.createReviewRecord({
      sessionId: input.sessionId,
      ...input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId },
      fileId: file.id,
      fileTitle: page.title,
      pathSnapshot: file.path,
      annotations: input.annotations,
    })
  }

  /**
   * History entries with the current link state: a renamed file is re-matched by content hash and
   * the identity is updated, so history stays attached while the content is unchanged.
   */
  async history(): Promise<{ entries: ReviewHistoryEntry[]; bytes: number }> {
    const records = this.store.listReviewRecords()
    const entries: ReviewHistoryEntry[] = []
    const deadline = Date.now() + RELOCATE_BUDGET_MS
    /** Per-root index cache for this request: records may belong to different workspaces. */
    const candidatesByRoot = new Map<string, readonly NotebookEntry[]>()
    for (const record of records) {
      const file = this.store.getNoteFile(record.fileId)
      if (file === undefined) {
        entries.push({ record, status: 'detached' })
        continue
      }
      const root = file.rootPath
      try {
        await stat(join(root, ...file.path.split('/')))
        entries.push({ record, status: 'linked', resolvedPath: file.path })
        continue
      } catch {
        // Fall through to rename detection.
      }
      if (Date.now() > deadline) {
        entries.push({ record, status: 'detached' })
        continue
      }
      const cached = this.relocateCache.get(file.id)
      let moved: string | undefined
      let conclusive = true
      if (cached !== undefined && cached.hash === file.hash && Date.now() - cached.at < RELOCATE_TTL_MS) {
        moved = cached.path
      } else {
        let candidates = candidatesByRoot.get(root)
        if (candidates === undefined) {
          candidates = await this.entries(root)
          candidatesByRoot.set(root, candidates)
        }
        for (const candidate of candidates.slice(0, RELOCATE_CANDIDATES)) {
          if (Date.now() > deadline) {
            // Not a conclusion: leave it uncached so the next request can finish the search.
            conclusive = false
            break
          }
          const hash = await hashFile(root, candidate.path)
          if (hash !== undefined && hash === file.hash) {
            moved = candidate.path
            break
          }
        }
        if (conclusive) this.rememberRelocate(file.id, file.hash, moved)
      }
      if (moved === undefined) {
        entries.push({ record, status: 'detached' })
        continue
      }
      await this.store.updateNoteFilePath(file.id, moved, file.hash)
      this.rememberRelocate(file.id, file.hash, moved)
      entries.push({ record, status: 'moved', resolvedPath: moved })
    }
    return { entries, bytes: records.reduce((sum, record) => sum + record.bytes, 0) }
  }

  /** Remember one rename conclusion, keeping the cache bounded. */
  private rememberRelocate(fileId: string, hash: string, path: string | undefined): void {
    this.relocateCache.set(fileId, {
      hash,
      at: Date.now(),
      ...path === undefined ? {} : { path },
    })
    while (this.relocateCache.size > RELOCATE_CACHE_LIMIT) {
      const oldest = this.relocateCache.keys().next()
      if (oldest.done === true) break
      this.relocateCache.delete(oldest.value)
    }
  }

  /** Delete one history record. */
  async deleteHistory(id: string): Promise<void> {
    await this.store.deleteReviewRecord(id)
  }

  /** Draft box of one file. */
  draft(fileId: string): NoteDraft | null {
    return this.store.getNoteDraft(fileId) ?? null
  }
}
