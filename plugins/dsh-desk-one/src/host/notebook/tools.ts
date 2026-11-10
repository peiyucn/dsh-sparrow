/**
 * Notebook tools for the agent surface.
 *
 * Only what the official tools cannot do: the annotation threads (a Desk One
 * object) and frontmatter-aware library search. Reading / writing page bodies is
 * left to the official file tools — wrapping them again would be duplicate debt.
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { ANNOTATION_STATUSES } from '../../constants.js'
import type { DeskStore } from '../store.js'
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

/** Register the notebook tools (annotations + library search). */
export function registerNotebookTools(ctx: Context, store: DeskStore, notebook: NotebookHost): void {
  ctx.tools.register(defineTool({
    name: 'desk_note_annotation_list',
    description: 'List review annotations on notebook pages (threads humans left on a page or a frontmatter field). Use it before replying to a review, and to find threads still waiting for the human (status "answered").',
    parameters: {
      path: { type: 'string', description: 'Only threads on this page (path relative to the notes library root).' },
      status: { type: 'string', enum: ANNOTATION_STATUSES, description: 'Only threads in this state: open / answered / resolved / orphaned.' },
      limit: { type: 'number', description: 'Maximum threads to return (default 50, max 200).' },
    },
    output: textOutput,
    execute(args) {
      const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(Math.floor(args.limit), 200) : 50
      const annotations = store.listAnnotations({
        ...args.path === undefined || args.path === '' ? {} : { path: args.path },
        ...args.status === undefined ? {} : { status: args.status },
      }).slice(0, limit)
      return Promise.resolve(JSON.stringify({
        ok: true,
        total: annotations.length,
        annotations,
        summary: annotations.length === 0 ? '没有匹配的批注' : `返回 ${annotations.length} 条批注`,
      }))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'desk_note_annotation_reply',
    description: 'Reply to one annotation thread after you changed the page (or after deciding no change is needed). The thread moves to "answered" — the human still has to accept it; never claim it is resolved.',
    parameters: {
      id: { type: 'string', required: true, description: 'Annotation id from desk_note_annotation_list.' },
      expected_revision: { type: 'number', required: true, description: 'The annotation revision returned by desk_note_annotation_list.' },
      body: { type: 'string', required: true, description: 'What you changed or why nothing changed (human-readable, concise).' },
    },
    output: textOutput,
    async execute(args) {
      try {
        const annotation = await store.replyAnnotation({
          id: args.id,
          expectedRevision: args.expected_revision,
          body: args.body,
          author: 'ai',
        })
        return JSON.stringify({ ok: true, annotation, summary: `已回复批注，状态改为「待接受」（${annotation.status}）` })
      } catch (error) {
        toolError(error)
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'desk_note_annotation_answered',
    description: 'Mark one annotation thread as handled without writing a reply (for example when the human\'s point needed no change). The human still keeps the final "resolved" action.',
    parameters: {
      id: { type: 'string', required: true, description: 'Annotation id from desk_note_annotation_list.' },
      expected_revision: { type: 'number', required: true, description: 'The annotation revision returned by desk_note_annotation_list.' },
    },
    output: textOutput,
    async execute(args) {
      try {
        const annotation = await store.updateAnnotationStatus(args.id, args.expected_revision, 'answered')
        return JSON.stringify({ ok: true, annotation, summary: '已标记为「待接受」；接受与否由人决定' })
      } catch (error) {
        toolError(error)
      }
    },
  }))

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
