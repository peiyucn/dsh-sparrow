/**
 * Notebook tools for the agent surface: frontmatter-aware library search.
 *
 * Review annotations are gone: a review directive belongs to the review conversation,
 * and the AI edits files with the official file tools.
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { NotebookHost } from './host.js'

/** Tool output is plain JSON text (rendered verbatim in the transcript). */
const textOutput = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

function toolError(error: unknown): never {
  if (error instanceof Error) throw error
  throw new Error(String(error))
}

/** Register the notebook tools (library search only). */
export function registerNotebookTools(ctx: Context, notebook: NotebookHost): void {
  ctx.tools.register(defineTool({
    name: 'desk_note_search',
    description: 'Search the notebook library with frontmatter semantics: free text over title/path/body plus exact "type" and "tag" filters. Returns indexed entries, not page contents — read a page with the official file tools.',
    parameters: {
      query: { type: 'string', description: 'Case-insensitive text over title, relative path and body.' },
      type: { type: 'string', description: 'Only pages whose frontmatter "type" equals this (note / meeting / daily / task …).' },
      tag: { type: 'string', description: 'Only pages carrying this frontmatter tag.' },
      limit: { type: 'number', description: 'Maximum entries to return (default 50, max 200).' },
    },
    output: textOutput,
    async execute(args) {
      try {
        const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(Math.floor(args.limit), 200) : 50
        const result = await notebook.search({
          ...args.query === undefined ? {} : { query: args.query },
          ...args.type === undefined ? {} : { type: args.type },
          ...args.tag === undefined ? {} : { tag: args.tag },
          limit,
        })
        return JSON.stringify({
          ok: true,
          total: result.entries.length,
          truncated: result.truncated,
          entries: result.entries,
          summary: result.entries.length === 0 ? '没有匹配的笔记' : `返回 ${result.entries.length} 篇笔记`,
        })
      } catch (error) {
        toolError(error)
      }
    },
  }))
}
