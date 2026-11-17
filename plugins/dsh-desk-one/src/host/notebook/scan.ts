

import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { NotebookEntry } from '../../notebook-contract.js'
import { NOTEBOOK_MAX_BYTES, NOTEBOOK_MAX_DEPTH, NOTEBOOK_MAX_FILES } from '../../constants.js'
import { displayTitle, parsePage } from './frontmatter.js'


const SKIP_DIRS = new Set([
  '.git', '.hg', '.svn', '.obsidian', '.trash', '.note2md', 'node_modules', '.next', 'dist', 'build',
])

const TEXT_SUFFIXES = new Set(['.md', '.markdown', '.txt'])


export function isIndexedPath(relativePath: string): boolean {
  const lower = relativePath.toLowerCase()
  const dot = lower.lastIndexOf('.')
  if (dot < 0) return false
  return TEXT_SUFFIXES.has(lower.slice(dot))
}


export function sortEntries(entries: readonly NotebookEntry[]): NotebookEntry[] {
  return [...entries].sort((left, right) => right.mtime.localeCompare(left.mtime) || left.path.localeCompare(right.path))
}


export async function scanLibrary(root: string, deadline: number): Promise<NotebookEntry[]> {
  const entries: NotebookEntry[] = []
  const walk = async (relativeDir: string, depth: number): Promise<void> => {
    if (entries.length >= NOTEBOOK_MAX_FILES || Date.now() > deadline) return
    let dirents
    try {
      dirents = await readdir(relativeDir === '' ? root : join(root, ...relativeDir.split('/')), { withFileTypes: true })
    } catch {
      return
    }
    for (const dirent of dirents) {
      if (entries.length >= NOTEBOOK_MAX_FILES || Date.now() > deadline) return
      const name = dirent.name
      if (name.startsWith('.')) continue
      const relativePath = relativeDir === '' ? name : `${relativeDir}/${name}`
      if (dirent.isDirectory()) {
        if (depth >= NOTEBOOK_MAX_DEPTH || SKIP_DIRS.has(name)) continue
        await walk(relativePath, depth + 1)
        continue
      }
      if (!dirent.isFile() || !isIndexedPath(relativePath)) continue
      const absolute = join(root, ...relativePath.split('/'))
      let info
      try {
        info = await stat(absolute)
      } catch {
        continue
      }
      if (info.size > NOTEBOOK_MAX_BYTES) continue
      let raw: string
      try {
        raw = await readFile(absolute, 'utf8')
      } catch {
        continue
      }
      const parsed = parsePage(raw, info.size)
      const emptyBody = parsed.body.trim() === ''
      entries.push({
        path: relativePath,
        title: displayTitle(parsed, relativePath),
        ...parsed.date === undefined ? {} : { date: parsed.date },
        ...parsed.type === undefined ? {} : { type: parsed.type },
        tags: parsed.tags,
        hasFrontmatter: parsed.hasFrontmatter,
        emptyBody,
        bytes: info.size,
        mtime: info.mtime.toISOString(),
      })
    }
  }
  await walk('', 0)
  return sortEntries(entries)
}
