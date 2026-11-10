/**
 * Notebook host: the notes-root setting plus the derived index and search.
 *
 * The index is a projection of the library on disk — nothing here writes a note,
 * and the walk is cached briefly so repeated shelf reads do not re-scan. The root
 * must live under a DSH workspace: that is what lets the agent write through its
 * own file tools without any extra sandbox grant.
 */

import { stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {
  DeskNotebookConfig, NoteIndexEntry, NotebookRootState, NotebookSearchQuery, NotebookStateResponse,
} from '../../contract.js'
import { NOTEBOOK_SCAN_TIMEOUT_MS, NOTEBOOK_SCAN_TTL_MS } from '../../constants.js'
import { DeskError } from '../http.js'
import { normalizeNotebookPath, isPathWithin, searchPages, summarizePages } from './library.js'
import { scanNotebook, type ScannedPage } from './scan.js'
import type { DeskStore } from '../store.js'

/** One cached scan. */
interface CachedScan {
  readonly pages: readonly ScannedPage[]
  readonly truncated: boolean
  readonly scannedAt: number
}

/** The state of a library that has no root or cannot be scanned. */
function unreachableState(config: DeskNotebookConfig | null, root: NotebookRootState, error?: string): NotebookStateResponse {
  return {
    config,
    root,
    stats: { total: 0, missingFrontmatter: 0, emptyBody: 0 },
    recent: [],
    truncated: false,
    scannedAt: new Date().toISOString(),
    ...error === undefined ? {} : { error },
  }
}

export class NotebookHost {
  private cache: CachedScan | undefined
  private scanning: Promise<CachedScan> | undefined

  constructor(private readonly ctx: Context, private readonly store: DeskStore) {}

  /** The configured root record, if any. */
  config(): DeskNotebookConfig | undefined {
    return this.store.getNotebookConfig()
  }

  /**
   * Validate the configured root: absolute, inside a workspace, and a directory.
   * @returns the root state the panel renders; never throws for a bad setting.
   */
  async rootState(): Promise<NotebookRootState> {
    const config = this.config()
    if (config === undefined) return { path: '', status: 'unset' }
    return await this.inspectRoot(config.rootPath)
  }

  /** Inspect one candidate root path without persisting anything. */
  private async inspectRoot(rootPath: string): Promise<NotebookRootState> {
    if (!isAbsolute(rootPath)) return { path: rootPath, status: 'missing' }
    if (!this.isUnderWorkspace(normalizeNotebookPath(rootPath))) return { path: rootPath, status: 'outside-workspace' }
    try {
      const info = await stat(rootPath)
      return { path: rootPath, status: info.isDirectory() ? 'ok' : 'not-directory' }
    } catch {
      return { path: rootPath, status: 'missing' }
    }
  }

  /** Whether an absolute path sits under one of the registered workspaces. */
  private isUnderWorkspace(target: string): boolean {
    for (const workspace of this.ctx.workspaceRegistry.list()) {
      if (isPathWithin(target, normalizeNotebookPath(workspace.path))) return true
    }
    return false
  }

  /**
   * Point the library at a new root.
   * @param rootPath - absolute directory under a DSH workspace.
   */
  async setRoot(rootPath: string): Promise<void> {
    const state = await this.inspectRoot(rootPath)
    if (state.status !== 'ok') {
      const reason = state.status === 'outside-workspace'
        ? '笔记库必须放在 DSH 工作区之内（工作区根目录或其子目录）'
        : state.status === 'not-directory' ? '所选路径不是目录' : '所选目录不存在或不可访问'
      throw new DeskError('INVALID_NOTEBOOK', reason, 400)
    }
    await this.store.saveNotebookRoot(rootPath)
    this.cache = undefined
  }

  /** Clear the configured root (the index is dropped with it). */
  async clearRoot(): Promise<void> {
    await this.store.clearNotebookRoot()
    this.cache = undefined
  }

  /**
   * The shelf state: config, root status, stats, recent pages.
   * @returns a response describing the library even when it cannot be scanned.
   */
  async state(): Promise<NotebookStateResponse> {
    const config = this.config()
    if (config === undefined) return unreachableState(null, { path: '', status: 'unset' })
    const root = await this.inspectRoot(config.rootPath)
    if (root.status !== 'ok') return unreachableState(config, root)
    let scan: CachedScan
    try {
      scan = await this.scan(config.rootPath)
    } catch (error) {
      return unreachableState(config, root, error instanceof Error ? error.message : String(error))
    }
    return { config, root, ...summarizePages(scan.pages, scan.truncated, scan.scannedAt) }
  }

  /**
   * Search the library.
   * @param query - text plus optional type/tag filters.
   * @returns matched entries and the truncation flag; empty when no root is usable.
   */
  async search(query: NotebookSearchQuery): Promise<{ entries: readonly NoteIndexEntry[]; truncated: boolean }> {
    const config = this.config()
    if (config === undefined) return { entries: [], truncated: false }
    const root = await this.inspectRoot(config.rootPath)
    if (root.status !== 'ok') return { entries: [], truncated: false }
    const scan = await this.scan(config.rootPath)
    return searchPages(scan.pages, query)
  }

  /** Reuse a fresh scan; single-flight concurrent readers; abandon one walk by timeout. */
  private async scan(rootPath: string): Promise<CachedScan> {
    const now = Date.now()
    if (this.cache !== undefined && now - this.cache.scannedAt < NOTEBOOK_SCAN_TTL_MS) return this.cache
    if (this.scanning !== undefined) return this.scanning
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('notebook scan timeout')), NOTEBOOK_SCAN_TIMEOUT_MS)
    const started = Date.now()
    const run = scanNotebook(rootPath, controller.signal)
      .then(result => {
        const scan: CachedScan = { pages: result.pages, truncated: result.truncated, scannedAt: started }
        this.cache = scan
        return scan
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) throw new DeskError('NOTEBOOK_SCAN_TIMEOUT', '笔记库扫描超时，请缩小笔记库或稍后重试', 503)
        throw error
      })
      .finally(() => { clearTimeout(timer); this.scanning = undefined })
    this.scanning = run
    return run
  }
}
