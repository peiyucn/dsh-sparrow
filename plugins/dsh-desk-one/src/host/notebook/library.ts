/**
 * Pure notebook helpers: path containment, shelf stats, and search filtering.
 *
 * Kept free of `node:fs` so the rules can be tested without touching a real
 * library; the scan and the host assemble them.
 */

import { normalize, sep } from 'node:path'
import { DeskModelError } from '../../model/errors.js'
import type { NoteIndexEntry, NotebookSearchQuery, NotebookStats } from '../../contract.js'
import { NOTEBOOK_SEARCH_LIMIT, NOTEBOOK_STATE_LIMIT } from '../../constants.js'
import type { ScannedPage } from './scan.js'

/** Normalize a path for containment checks: forward slashes, no trailing separator. */
export function normalizeNotebookPath(path: string): string {
  const normalized = normalize(path).split(sep).join('/')
  return normalized.length > 1 ? normalized.replace(/\/+$/u, '') : normalized
}

/**
 * Whether `child` equals or sits below `parent`.
 * @param child - normalized absolute path.
 * @param parent - normalized absolute path (a workspace root or the library root).
 * @returns true when `child` is the same path or inside it.
 */
export function isPathWithin(child: string, parent: string): boolean {
  if (child === parent) return true
  const prefix = parent.endsWith('/') ? parent : `${parent}/`
  return child.startsWith(prefix)
}

/**
 * Normalize a page path relative to the library root; absolute paths and parent
 * segments are rejected so a thread (or an open request) can never point outside.
 * @param raw - candidate path.
 * @returns the normalized, `/`-separated relative path.
 */
export function normalizeLibraryPath(raw: unknown): string {
  if (typeof raw !== 'string') throw new DeskModelError('INVALID_ANNOTATION', '缺少笔记路径')
  const normalized = raw.replace(/\\/gu, '/').trim()
  if (normalized === '') throw new DeskModelError('INVALID_ANNOTATION', '缺少笔记路径')
  if (normalized.startsWith('/') || /^[A-Za-z]:/u.test(normalized)) {
    throw new DeskModelError('INVALID_ANNOTATION', '笔记路径必须是相对笔记库根的路径')
  }
  const segments = normalized.split('/')
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new DeskModelError('INVALID_ANNOTATION', '笔记路径不能包含空段或上级目录')
  }
  return segments.join('/')
}

/** Stats plus the newest rows the shelf shows. */
export function summarizePages(pages: readonly ScannedPage[], truncated: boolean, scannedAt: number): {
  readonly stats: NotebookStats
  readonly recent: readonly NoteIndexEntry[]
  readonly truncated: boolean
  readonly scannedAt: string
} {
  let missingFrontmatter = 0
  let emptyBody = 0
  for (const page of pages) {
    if (!page.entry.hasFrontmatter) missingFrontmatter += 1
    if (page.entry.bodyChars === 0) emptyBody += 1
  }
  return {
    stats: { total: pages.length, missingFrontmatter, emptyBody },
    recent: pages.slice(0, NOTEBOOK_STATE_LIMIT).map(page => page.entry),
    truncated,
    scannedAt: new Date(scannedAt).toISOString(),
  }
}

/** Filter one scan for the search endpoint; `query` matches title/path/body, `type` and `tag` are exact. */
export function searchPages(pages: readonly ScannedPage[], query: NotebookSearchQuery): {
  readonly entries: readonly NoteIndexEntry[]
  readonly truncated: boolean
} {
  const needle = (query.query ?? '').trim().toLowerCase()
  const type = query.type?.trim()
  const tag = query.tag?.trim()
  const matched: NoteIndexEntry[] = []
  for (const page of pages) {
    const entry = page.entry
    if (type !== undefined && type !== '' && entry.type !== type) continue
    if (tag !== undefined && tag !== '' && !entry.tags.includes(tag)) continue
    if (query.missingFrontmatter === true && entry.hasFrontmatter) continue
    if (query.emptyBody === true && entry.bodyChars > 0) continue
    if (needle !== ''
      && !entry.title.toLowerCase().includes(needle)
      && !entry.path.toLowerCase().includes(needle)
      && !page.body.toLowerCase().includes(needle)) continue
    matched.push(entry)
  }
  const limit = query.limit === undefined ? NOTEBOOK_SEARCH_LIMIT : Math.min(Math.max(1, query.limit), NOTEBOOK_SEARCH_LIMIT)
  return { entries: matched.slice(0, limit), truncated: matched.length > limit }
}
