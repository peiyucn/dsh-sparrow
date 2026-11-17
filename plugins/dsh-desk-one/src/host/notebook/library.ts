

import { realpath, readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, win32 } from 'node:path'
import type {
  NotebookEntry, NotebookField, NotebookPageResponse, NotebookSearchResponse, NotebookStats,
} from '../../notebook-contract.js'
import { NOTEBOOK_MAX_BYTES } from '../../constants.js'
import { DeskError } from '../http.js'
import { displayTitle, parsePage } from './frontmatter.js'


const BINARY_PROBE_BYTES = 8_192


export function normalizeRelativePath(relativePath: string): string {
  if (isAbsolute(relativePath) || win32.isAbsolute(relativePath)) {
    throw new DeskError('BAD_BODY', '路径必须是相对路径')
  }
  const parts = relativePath.replace(/\\/gu, '/').split('/')
  const clean: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') throw new DeskError('BAD_BODY', '路径不能跳出笔记库')
    clean.push(part)
  }
  if (clean.length === 0) throw new DeskError('BAD_BODY', '缺少文件路径')
  return clean.join('/')
}


function isWithin(rootReal: string, absoluteFile: string): boolean {
  return absoluteFile === rootReal || absoluteFile.startsWith(`${rootReal}/`) || absoluteFile.startsWith(`${rootReal}\\`)
}


export async function readPage(root: string, relativePath: string): Promise<NotebookPageResponse> {
  const relative = normalizeRelativePath(relativePath)
  const absolute = join(root, ...relative.split('/'))
  let rootReal: string
  let fileReal: string
  try {
    rootReal = await realpath(root)
    fileReal = await realpath(absolute)
  } catch {
    throw new DeskError('UNKNOWN_NOTE', '文件不存在或不可访问', 404)
  }
  if (!isWithin(rootReal, fileReal)) throw new DeskError('FORBIDDEN', '文件必须位于笔记库内', 403)
  const info = await stat(fileReal)
  if (!info.isFile()) throw new DeskError('BAD_BODY', '目标必须是文件')
  if (info.size > NOTEBOOK_MAX_BYTES) throw new DeskError('BAD_BODY', '文件过大，暂不支持审阅', 400)
  const bytes = await readFile(fileReal)
  if (bytes.subarray(0, BINARY_PROBE_BYTES).includes(0)) {
    throw new DeskError('BAD_BODY', '只能审阅纯文本文件', 400)
  }
  const raw = bytes.toString('utf8')
  const markdown = /\.(?:md|markdown)$/iu.test(relative)
  const parsed = parsePage(raw, bytes.byteLength)
  const fields: NotebookField[] = markdown ? [...parsed.fields] : []
  return {
    path: relative,
    title: displayTitle(parsed, relative),
    kind: markdown ? 'markdown' : 'text',
    fields,
    frontmatter: markdown ? parsed.frontmatter : '',
    body: markdown ? parsed.body : raw,
    bytes: bytes.byteLength,
  }
}


export function summarize(entries: readonly NotebookEntry[]): NotebookStats {
  let missingFrontmatter = 0
  let emptyBody = 0
  for (const entry of entries) {
    if (!entry.hasFrontmatter) missingFrontmatter += 1
    if (entry.emptyBody) emptyBody += 1
  }
  return { total: entries.length, missingFrontmatter, emptyBody }
}


export function searchEntries(
  entries: readonly NotebookEntry[],
  query: string,
  filters: {
    readonly type?: string
    readonly tag?: string
    readonly missingFrontmatter?: boolean
    readonly emptyBody?: boolean
  },
  limit: number,
): NotebookSearchResponse {
  const needle = query.trim().toLowerCase()
  const matched = entries.filter((entry) => {
    if (filters.type !== undefined && entry.type !== filters.type) return false
    if (filters.tag !== undefined && !entry.tags.includes(filters.tag)) return false
    if (filters.missingFrontmatter === true && entry.hasFrontmatter) return false
    if (filters.emptyBody === true && !entry.emptyBody) return false
    if (needle === '') return true
    return entry.title.toLowerCase().includes(needle) || entry.path.toLowerCase().includes(needle)
  })
  return { entries: matched.slice(0, limit), truncated: matched.length > limit }
}
