/**
 * Filesystem walk for the notes index.
 *
 * The index is a pure projection of the library on disk: nothing here writes, and
 * every limit exists so a pathological library degrades to a "truncated" flag
 * instead of hanging the request or exhausting memory.
 */

import { open, readdir, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import type { NoteIndexEntry } from '../../contract.js'
import {
  NOTEBOOK_BODY_PREVIEW_CHARS, NOTEBOOK_EXCLUDED_DIRS, NOTEBOOK_MAX_DEPTH, NOTEBOOK_MAX_FILES, NOTEBOOK_SUFFIXES,
} from '../../constants.js'
import { FRONTMATTER_HEAD_BYTES, parseFrontmatter } from './frontmatter.js'

/** One indexed page plus the text the search matches in (never sent to the client). */
export interface ScannedPage {
  readonly entry: NoteIndexEntry
  /** Body text capped at `NOTEBOOK_BODY_PREVIEW_CHARS`. */
  readonly body: string
}

export interface ScanResult {
  readonly pages: readonly ScannedPage[]
  /** True when a depth or file-count limit cut the walk. */
  readonly truncated: boolean
}

/** Lower-cased directory names that are never indexed. */
const EXCLUDED = new Set(NOTEBOOK_EXCLUDED_DIRS.map(name => name.toLowerCase()))

/** Whether a file name carries a markdown suffix (case-insensitive). */
function isMarkdown(name: string): boolean {
  const lower = name.toLowerCase()
  return NOTEBOOK_SUFFIXES.some(suffix => lower.endsWith(suffix))
}

/** Read up to `limit` bytes from the start of a file. */
async function readHead(path: string, limit: number): Promise<string> {
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(limit)
    const { bytesRead } = await handle.read(buffer, 0, limit, 0)
    return buffer.subarray(0, bytesRead).toString('utf8')
  } finally {
    await handle.close()
  }
}

/** Normalize a child path into the `/`-separated relative key the contract exposes. */
function keyOf(root: string, absolute: string): string {
  return relative(root, absolute).split(sep).join('/')
}

/**
 * Walk one library root and index every markdown page.
 * @param root - absolute notes root.
 * @param signal - cancels the walk between files.
 * @returns pages newest-first plus the truncation flag; unreadable subdirectories are skipped.
 */
export async function scanNotebook(root: string, signal: AbortSignal): Promise<ScanResult> {
  const pages: ScannedPage[] = []
  let truncated = false
  const stack: { readonly dir: string; readonly depth: number }[] = [{ dir: root, depth: 0 }]
  while (stack.length > 0) {
    signal.throwIfAborted()
    const { dir, depth } = stack.pop()!
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      // An unreadable subdirectory is skipped, not fatal: the index stays partial and honest.
      continue
    }
    for (const entry of entries) {
      if (pages.length >= NOTEBOOK_MAX_FILES) { truncated = true; break }
      const absolute = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (EXCLUDED.has(entry.name.toLowerCase())) continue
        if (depth + 1 > NOTEBOOK_MAX_DEPTH) { truncated = true; continue }
        stack.push({ dir: absolute, depth: depth + 1 })
        continue
      }
      if (!entry.isFile() || !isMarkdown(entry.name)) continue
      signal.throwIfAborted()
      try {
        const info = await stat(absolute)
        const head = await readHead(absolute, FRONTMATTER_HEAD_BYTES)
        const parsed = parseFrontmatter(head, info.size)
        const body = parsed.body.slice(0, NOTEBOOK_BODY_PREVIEW_CHARS)
        const path = keyOf(root, absolute)
        pages.push({
          body,
          entry: {
            path,
            title: parsed.title ?? entry.name.replace(/\.(?:md|markdown)$/iu, ''),
            ...parsed.type === undefined ? {} : { type: parsed.type },
            ...parsed.date === undefined ? {} : { date: parsed.date },
            tags: parsed.tags,
            mtimeMs: info.mtimeMs,
            bytes: info.size,
            hasFrontmatter: parsed.bytes > 0,
            bodyChars: Math.max(0, parsed.body.trim().length),
          },
        })
      } catch {
        // A file that disappeared or cannot be read mid-walk is skipped.
      }
    }
    if (truncated) break
  }
  pages.sort((left, right) => right.entry.mtimeMs - left.entry.mtimeMs)
  return { pages, truncated }
}
