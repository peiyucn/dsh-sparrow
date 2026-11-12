/**
 * Notebook host: library state (derived scan), search, single-page reads, and the draft box.
 *
 * The scan is cached with a short TTL and single-flight semantics: the panel polls state while
 * it is open, and a large folder must not be re-walked for every request.
 */

import type { NotebookEntry, NotebookStateResponse } from '../../notebook-contract.js'
import { NOTEBOOK_SCAN_TIMEOUT_MS } from '../../constants.js'
import { DeskError } from '../http.js'
import type { DeskStore } from '../store.js'
import { readPage, searchEntries, summarize } from './library.js'
import { scanLibrary } from './scan.js'

/** How long one scan is reused before the next request rescans. */
const SCAN_TTL_MS = 30_000
/** How many recent pages the shelf shows. */
const RECENT_LIMIT = 30

/** Notebook data facade shared by routes and tools. */
export class NotebookHost {
  /** Last successful scan and its root. */
  private cache: { readonly root: string; readonly at: number; readonly entries: readonly NotebookEntry[] } | undefined
  /** In-flight scan (single flight). */
  private pending: Promise<readonly NotebookEntry[]> | undefined

  /** @param store - unified storage store. */
  constructor(private readonly store: DeskStore) {}

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

  /** Header state: config, counts, newest pages. */
  async state(): Promise<NotebookStateResponse> {
    const root = this.root()
    if (root === undefined) {
      return { config: null, stats: { total: 0, missingFrontmatter: 0, emptyBody: 0 }, recent: [] }
    }
    const entries = await this.entries(root)
    const config = this.store.getNotebookConfig() ?? null
    return { config, stats: summarize(entries), recent: entries.slice(0, RECENT_LIMIT) }
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
    const root = this.root()
    if (root === undefined) throw new DeskError('NOTEBOOK_UNAVAILABLE', '还没有设置笔记库', 409)
    return readPage(root, relativePath)
  }

  /** Drop the cached scan (root changed). */
  invalidate(): void {
    this.cache = undefined
  }
}
