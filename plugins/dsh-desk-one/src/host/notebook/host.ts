

import { readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type {
  NoteDraft, NotebookEntry, NotebookFileResponse, NotebookPageResponse, NotebookStateResponse,
  RecordReviewRequest, ReviewHistoryEntry, ReviewRecord,
} from '../../notebook-contract.js'
import { NOTEBOOK_MAX_BYTES, NOTEBOOK_SCAN_TIMEOUT_MS } from '../../constants.js'
import { DeskError } from '../http.js'
import type { DeskStore } from '../store.js'
import { createLibraryCache } from './cache.js'
import { ensureNoteFile } from './files.js'
import { readPage, searchEntries, summarize } from './library.js'
import { scanLibrary } from './scan.js'


const SCAN_TTL_MS = 30_000

const RECENT_LIMIT = 30

const RELOCATE_CANDIDATES = 400

const RELOCATE_BUDGET_MS = 3_000

const RELOCATE_TTL_MS = 60_000

const RELOCATE_CACHE_LIMIT = 500


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


export class NotebookHost {

  private readonly scans = createLibraryCache<NotebookEntry>(
    root => scanLibrary(root, Date.now() + NOTEBOOK_SCAN_TIMEOUT_MS),
    SCAN_TTL_MS,
  )

  private readonly relocateCache = new Map<string, {
    readonly hash: string
    readonly at: number
    readonly path?: string
  }>()


  constructor(private readonly store: DeskStore) {}


  root(): string | undefined {
    return this.store.getNotebookConfig()?.rootPath
  }


  private entries(root: string): Promise<readonly NotebookEntry[]> {
    return this.scans.get(root)
  }


  private requireRoot(): string {
    const root = this.root()
    if (root === undefined) throw new DeskError('NOTEBOOK_UNAVAILABLE', '还没有设置笔记库', 409)
    return root
  }


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
      }
    }
    const entries = await this.entries(root)
    const drafts = this.store.listNoteDrafts().filter(draft => draft.rootPath === root && draft.drafts.length > 0)
    return {
      config,
      stats: summarize(entries),
      recent: entries.slice(0, RECENT_LIMIT),
      drafts,
      draftCount: drafts.length,
      historyCount: history.length,
      historyBytes,
    }
  }


  async list(input: {
    readonly offset?: number
    readonly limit?: number
    readonly missingFrontmatter?: boolean
  }): Promise<{ entries: readonly NotebookEntry[]; total: number }> {
    const root = this.root()
    if (root === undefined) return { entries: [], total: 0 }
    const all = await this.entries(root)
    const filtered = input.missingFrontmatter === true ? all.filter(entry => !entry.hasFrontmatter) : all
    const offset = Math.max(0, Math.trunc(input.offset ?? 0))
    const limit = Math.min(Math.max(1, Math.trunc(input.limit ?? 10)), 200)
    return { entries: filtered.slice(offset, offset + limit), total: filtered.length }
  }


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


  async ensureFile(relativePath: string): Promise<NotebookFileResponse> {
    const file = await ensureNoteFile(this.store, this.requireRoot(), relativePath)
    return { file }
  }


  async openAt(rootPath: string, relativePath: string): Promise<{ file: NotebookFileResponse['file']; page: NotebookPageResponse }> {
    const file = await ensureNoteFile(this.store, rootPath, relativePath)
    return { file, page: await readPage(rootPath, relativePath) }
  }


  async openById(fileId: string): Promise<{ file: NotebookFileResponse['file']; page: NotebookPageResponse }> {
    const file = this.store.getNoteFile(fileId)
    if (file === undefined) throw new DeskError('UNKNOWN_NOTE', '文件身份不存在', 404)
    return { file, page: await readPage(file.rootPath, file.path) }
  }


  async recordReview(input: RecordReviewRequest): Promise<ReviewRecord> {
    const file = this.store.getNoteFile(input.fileId)
    if (file === undefined) throw new DeskError('UNKNOWN_NOTE', '文件身份不存在', 404)

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


  async history(): Promise<{ entries: ReviewHistoryEntry[]; bytes: number }> {
    const records = this.store.listReviewRecords()
    const entries: ReviewHistoryEntry[] = []
    const deadline = Date.now() + RELOCATE_BUDGET_MS

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


  async deleteHistory(id: string): Promise<void> {
    await this.store.deleteReviewRecord(id)
  }


  draft(fileId: string): NoteDraft | null {
    return this.store.getNoteDraft(fileId) ?? null
  }


  invalidate(): void {
    this.scans.invalidate()
    this.relocateCache.clear()
  }

}
