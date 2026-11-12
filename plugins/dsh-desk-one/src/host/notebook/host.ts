/**
 * Notebook host: derived index, single-page reads, file identity, the draft box, and review
 * history.
 *
 * The scan is cached with a short TTL and single-flight semantics. File identities are assigned
 * lazily (first review) and re-resolved by content hash, so a renamed file keeps its history.
 */

import { readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type {
  CreateNotebookNoteRequest, NoteDraft, NotebookEntry, NotebookFileResponse, NotebookStateResponse, NotebookSkill,
  RecordReviewRequest, ReviewHistoryEntry, ReviewRecord,
} from '../../notebook-contract.js'
import { NOTEBOOK_HISTORY_WARN_BYTES, NOTEBOOK_MAX_BYTES, NOTEBOOK_SCAN_TIMEOUT_MS } from '../../constants.js'
import { DeskError } from '../http.js'
import type { DeskStore } from '../store.js'
import { detectNote2md, ensureNoteFile, createNoteFile } from './files.js'
import { readPage, searchEntries, summarize } from './library.js'
import { resolveSkillName, toNotebookSkills, type SkillSummaryLike } from './skills.js'
import { scanLibrary } from './scan.js'

/** How long one scan is reused before the next request rescans. */
const SCAN_TTL_MS = 30_000
/** How many recent pages the shelf shows. */
const RECENT_LIMIT = 30
/** How many candidate files a history resolution hashes before giving up. */
const RELOCATE_CANDIDATES = 400
/** Resolve budget for one history request (ms). */
const RELOCATE_BUDGET_MS = 3_000

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

/** Host skill catalog narrowed to what the notebook page needs. */
export interface SkillCatalog {
  list(options: { readonly cwd?: string; readonly signal?: AbortSignal }): Promise<readonly SkillSummaryLike[]>
}

/** Notebook data facade shared by routes and tools. */
export class NotebookHost {
  /** Last successful scan and its root. */
  private cache: { readonly root: string; readonly at: number; readonly entries: readonly NotebookEntry[] } | undefined
  /** In-flight scan (single flight). */
  private pending: Promise<readonly NotebookEntry[]> | undefined
  /** note2md detection per root. */
  private note2mdCache: { readonly root: string; readonly value: boolean } | undefined

  /**
   * @param store - unified storage store.
   * @param skillCatalog - live optional host skill catalog; absent hosts simply offer no skills.
   */
  constructor(
    private readonly store: DeskStore,
    private readonly skillCatalog?: () => SkillCatalog | undefined,
  ) {}

  /** Configured root, if any. */
  root(): string | undefined {
    return this.store.getNotebookConfig()?.rootPath
  }

  /** Index the root, reusing the last scan while it is fresh. */
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

  /** Library root or a readable error. */
  private requireRoot(): string {
    const root = this.root()
    if (root === undefined) throw new DeskError('NOTEBOOK_UNAVAILABLE', '还没有设置笔记库', 409)
    return root
  }

  /** Skills offered for drafting, recomputed per request so catalog changes show up live. */
  private async draftSkills(root: string): Promise<readonly NotebookSkill[]> {
    const catalog = this.skillCatalog?.()
    if (catalog === undefined) return []
    try {
      const summaries = await catalog.list({ cwd: root })
      return toNotebookSkills(summaries.filter(summary => summary.invocation?.modelInvocable !== false).slice(0, 200))
    } catch {
      // The catalog is an optional enhancement: a broken provider must not break the page.
      return []
    }
  }

  /** Header state: config, counts, newest pages, drafts and history usage. */
  async state(): Promise<NotebookStateResponse> {
    const root = this.root()
    const history = this.store.listReviewRecords()
    const historyBytes = history.reduce((sum, record) => sum + record.bytes, 0)
    const config = this.store.getNotebookConfig() ?? null
    if (root === undefined) {
      return {
        config: null,
        stats: { total: 0, missingFrontmatter: 0, emptyBody: 0 },
        recent: [],
        drafts: [],
        draftCount: 0,
        historyCount: 0,
        historyBytes: 0,
        note2md: false,
        skills: [],
        skillName: null,
      }
    }
    const entries = await this.entries(root)
    const drafts = this.store.listNoteDrafts().filter(draft => draft.rootPath === root && draft.drafts.length > 0)
    let note2md = false
    if (this.note2mdCache?.root === root) note2md = this.note2mdCache.value
    else {
      note2md = await detectNote2md(root)
      this.note2mdCache = { root, value: note2md }
    }
    const skills = await this.draftSkills(root)
    return {
      config,
      stats: summarize(entries),
      recent: entries.slice(0, RECENT_LIMIT),
      drafts,
      draftCount: drafts.length,
      historyCount: history.length,
      historyBytes,
      note2md,
      skills,
      skillName: resolveSkillName(skills, config?.skillName),
    }
  }

  /** Search indexed entries. */
  async search(input: {
    readonly query?: string
    readonly type?: string
    readonly tag?: string
    readonly missingFrontmatter?: boolean
    readonly emptyBody?: boolean
    readonly limit?: number
  }) {
    const root = this.root()
    if (root === undefined) return { entries: [], truncated: false }
    const entries = await this.entries(root)
    return searchEntries(entries, input.query ?? '', input, input.limit ?? 100)
  }

  /** Read one page for the review tab. */
  async page(relativePath: string) {
    return readPage(this.requireRoot(), relativePath)
  }

  /** Resolve (or lazily assign) the identity of one file. */
  async ensureFile(relativePath: string): Promise<NotebookFileResponse> {
    const file = await ensureNoteFile(this.store, this.requireRoot(), relativePath)
    return { file }
  }

  /** Create one new note file from the template; returns its relative path. */
  async createNote(input: CreateNotebookNoteRequest): Promise<{ path: string }> {
    const path = await createNoteFile(this.requireRoot(), input)
    this.invalidate()
    return { path }
  }

  /** Record one submitted review (annotations + file snapshot metadata). */
  async recordReview(input: RecordReviewRequest): Promise<ReviewRecord> {
    const root = this.requireRoot()
    const file = this.store.getNoteFile(input.fileId)
    if (file === undefined || file.rootPath !== root) throw new DeskError('UNKNOWN_NOTE', '文件身份不存在', 404)
    const page = await readPage(root, file.path)
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
    const root = this.root()
    const entries: ReviewHistoryEntry[] = []
    const deadline = Date.now() + RELOCATE_BUDGET_MS
    let candidates: readonly NotebookEntry[] | undefined
    for (const record of records) {
      if (root === undefined) {
        entries.push({ record, status: 'detached' })
        continue
      }
      const file = this.store.getNoteFile(record.fileId)
      if (file === undefined || file.rootPath !== root) {
        entries.push({ record, status: 'detached' })
        continue
      }
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
      candidates ??= await this.entries(root)
      let moved: string | undefined
      for (const candidate of candidates.slice(0, RELOCATE_CANDIDATES)) {
        const hash = await hashFile(root, candidate.path)
        if (hash !== undefined && hash === file.hash) {
          moved = candidate.path
          break
        }
      }
      if (moved === undefined) {
        entries.push({ record, status: 'detached' })
        continue
      }
      await this.store.updateNoteFilePath(file.id, moved, file.hash)
      entries.push({ record, status: 'moved', resolvedPath: moved })
    }
    return { entries, bytes: records.reduce((sum, record) => sum + record.bytes, 0) }
  }

  /** Delete one history record. */
  async deleteHistory(id: string): Promise<void> {
    await this.store.deleteReviewRecord(id)
  }

  /** Draft box of one file. */
  draft(fileId: string): NoteDraft | null {
    return this.store.getNoteDraft(fileId) ?? null
  }

  /** Whether history usage crossed the warning threshold (entry page renders a red meter). */
  historyWarn(bytes: number): boolean {
    return bytes >= NOTEBOOK_HISTORY_WARN_BYTES
  }

  /** Drop the cached scan (root changed). */
  invalidate(): void {
    this.cache = undefined
    this.note2mdCache = undefined
  }

}
