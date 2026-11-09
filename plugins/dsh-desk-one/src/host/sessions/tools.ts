/** Agent tools over the session index: find conversations by metadata, then use normal session reads. */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { DeskSessionIndex } from '../../contract.js'
import type { DeskStore } from '../store.js'
import type { SessionsHost } from './install.js'

const textOutput = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

function rowOf(node: DeskSessionIndex) {
  return {
    sessionId: node.sessionId,
    title: node.title,
    cwd: node.cwd,
    parentSessionId: node.parentSessionId,
    subagent: node.subagent,
    running: node.running,
    availability: node.availability,
    updatedAt: node.updatedAt,
  }
}

export function registerSessionTools(ctx: Context, store: DeskStore, sessions: SessionsHost): void {
  ctx.tools.register(defineTool({
    name: 'desk_session_search',
    description: 'Search the Desk One session index (title / workspace / session id). Archived sessions are included; use the returned sessionId with normal session tools to read the conversation.',
    parameters: {
      query: { type: 'string', description: 'Case-insensitive text over title / cwd / session id; empty lists recent sessions.' },
      limit: { type: 'number', description: 'Max rows (1-100, default 20).' },
      include_archived: { type: 'boolean', description: 'Include archived sessions (default true).' },
    },
    output: textOutput,
    async execute(args) {
      await sessions.refreshIndex()
      const includeArchived = args.include_archived !== false
      const rows = store.listSessionIndexes(args.query, args.limit)
        .filter(node => includeArchived || node.availability !== 'archived')
        .map(rowOf)
      return JSON.stringify({ ok: true, count: rows.length, sessions: rows })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'desk_session_get',
    description: 'Resolve one session index row by its canonical sessionId (use after desk_session_search).',
    parameters: {
      session_id: { type: 'string', required: true, description: 'Canonical DSH session id.' },
    },
    output: textOutput,
    async execute(args) {
      await sessions.refreshIndex()
      const node = store.findSessionIndex(args.session_id)
      return JSON.stringify(node === undefined
        ? { ok: false, error: { code: 'SESSION_NOT_INDEXED', message: '会话不在索引里（可能已被清理或尚未刷新）' } }
        : { ok: true, session: rowOf(node) })
    },
  }))
}
