/**
 * Notebook library tool: one read-only list/search over the user's note pages.
 *
 * The notebook is a filesystem library, not a Desk node: agents read and edit the files with the
 * normal file tools. This tool exists for the part file tools cannot do cheaply — filtering by
 * frontmatter metadata (missing metadata, empty body), tags and titles, and returning the library
 * root so a relative path can be resolved.
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { PACKAGE_NAME } from '../../constants.js'
import { textOutput, toolError } from '../tools/shared.js'
import type { NotebookEntry } from '../../notebook-contract.js'

/** Notebook capabilities this tool needs (structural, so tests can fake it). */
export interface NotebookSearchFace {
  root(): string | undefined
  search(input: {
    readonly query?: string
    readonly type?: string
    readonly tag?: string
    readonly missingFrontmatter?: boolean
    readonly emptyBody?: boolean
    readonly limit?: number
  }): Promise<{ readonly entries: readonly NotebookEntry[]; readonly truncated: boolean }>
}

/** Register the read-only page list tool. */
export function registerNotebookTools(ctx: Context, notebook: NotebookSearchFace): void {
  ctx.tools.register(defineTool({
    name: 'desk_page_list',
    description: 'Search / list pages in the user\'s linked notebook library (read-only). Filter by keyword over title and path, by tag, by type, or by missing frontmatter / empty body. Returns each page\'s path relative to the library root plus its metadata; use the normal file tools to read or edit the page content. Content changes still go through file tools — this tool never writes.',
    parameters: {
      query: { type: 'string', description: 'Case-insensitive keyword over title and path.' },
      tag: { type: 'string', description: 'Only pages carrying this frontmatter tag.' },
      type: { type: 'string', description: 'Only pages with this frontmatter type.' },
      missing_frontmatter: { type: 'boolean', description: 'Only pages without a frontmatter block (missing metadata).' },
      empty_body: { type: 'boolean', description: 'Only pages whose body is empty.' },
      limit: { type: 'number', description: 'Maximum pages to return (default 50, max 200).' },
    },
    output: textOutput,
    async execute(args) {
      try {
        const root = notebook.root()
        if (root === undefined) {
          return JSON.stringify({ ok: true, total: 0, entries: [], summary: '还没有链接笔记库（先让用户在笔记页选择一个工作区）' })
        }
        const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(Math.floor(args.limit), 200) : 50
        const result = await notebook.search({
          ...args.query === undefined ? {} : { query: args.query },
          ...args.tag === undefined ? {} : { tag: args.tag },
          ...args.type === undefined ? {} : { type: args.type },
          ...args.missing_frontmatter === true ? { missingFrontmatter: true } : {},
          ...args.empty_body === true ? { emptyBody: true } : {},
          limit,
        })
        const entries = result.entries.map(entry => ({
          path: entry.path,
          title: entry.title,
          ...entry.date === undefined ? {} : { date: entry.date },
          ...entry.type === undefined ? {} : { type: entry.type },
          tags: entry.tags,
          hasFrontmatter: entry.hasFrontmatter,
          emptyBody: entry.emptyBody,
          bytes: entry.bytes,
          mtime: entry.mtime,
        }))
        return JSON.stringify({
          ok: true,
          root,
          total: entries.length,
          truncated: result.truncated,
          entries,
          summary: entries.length === 0 ? '没有匹配的笔记页' : `返回 ${entries.length} 篇笔记页（路径相对 root）`,
        })
      } catch (error) {
        toolError(error)
      }
    },
  }))
  ctx.logger.info?.(`${PACKAGE_NAME}: registered desk_page_list tool`)
}
