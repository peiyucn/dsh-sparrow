/**
 * Agent tool surface: shares the same DeskStore as the UI (same objects, same validation);
 * tools return structured JSON plus a human-readable summary so the model can restate it directly.
 *
 * Object-oriented surface: one `save` tool per object type (create when no id, update when id +
 * revision) instead of separate add/update verbs. See docs/spec/01-object-model.md.
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { PACKAGE_NAME, NOTE_COLORS } from '../../constants.js'
import type { DeskStore } from '../store.js'

/** Tool output is always a string (JSON text); render hands it to the conversation area as-is. */
const textOutput = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

function toolError(error: unknown): never {
  if (error instanceof Error) throw error
  throw new Error(String(error))
}

/** Register the three note tools; the tools share the store with the REST routes. */
export function registerDeskTools(ctx: Context, store: DeskStore): void {
  ctx.tools.register(defineTool({
    name: 'desk_note_list',
    description: 'List the user\'s desk notes (the notes wall), pinned first and newest first within the same pin state. Optionally filter by a case-insensitive keyword over title and body.',
    parameters: {
      query: { type: 'string', description: 'Case-insensitive keyword to match against title and body.' },
      limit: { type: 'number', description: 'Maximum notes to return (default 50, max 200).' },
      include_trashed: { type: 'boolean', description: 'Include notes currently in the trash (default false).' },
    },
    output: textOutput,
    execute(args) {
      const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(Math.floor(args.limit), 200) : 50
      const all = store.listNotes(args.query)
      const notes = (args.include_trashed === true ? all : all.filter(note => !note.trashed)).slice(0, limit)
      return Promise.resolve(JSON.stringify({
        ok: true,
        total: notes.length,
        notes,
        summary: notes.length === 0 ? '没有匹配的便签' : `返回 ${notes.length} 条便签（默认不含垃圾桶）`,
      }))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'desk_note_save',
    description: 'Create or update one desk note (notes wall). Omit id to create; pass id + expected_revision to update. Get both from desk_note_list first — a revision mismatch is rejected so concurrent edits never overwrite each other.',
    parameters: {
      id: { type: 'string', description: 'Note id from desk_note_list; omit to create a new note.' },
      expected_revision: { type: 'number', description: 'Required when id is given: the revision returned by desk_note_list.' },
      title: { type: 'string', description: 'Note title (at most 200 characters). Optional when body is given.' },
      body: { type: 'string', description: 'Note body, Markdown is allowed (at most 20000 characters).' },
      color: { type: 'string', enum: NOTE_COLORS, description: 'Color tag for the card; defaults to "default".' },
      pinned: { type: 'boolean', description: 'Pin or unpin the note (update only).' },
      trashed: { type: 'boolean', description: 'Move the note to the trash (true) or restore it (false); update only.' },
    },
    output: textOutput,
    async execute(args) {
      try {
        if (args.id === undefined) {
          const note = await store.createNote({ title: args.title, body: args.body, color: args.color })
          return JSON.stringify({ ok: true, created: true, note, summary: `已新建便签「${note.title}」` })
        }
        if (typeof args.expected_revision !== 'number') {
          throw new Error('更新便签需要 expected_revision：先调 desk_note_list 拿 id 和 revision')
        }
        const note = await store.updateNote(args.id, args.expected_revision, {
          ...args.title === undefined ? {} : { title: args.title },
          ...args.body === undefined ? {} : { body: args.body },
          ...args.color === undefined ? {} : { color: args.color },
          ...args.pinned === undefined ? {} : { pinned: args.pinned },
          ...args.trashed === undefined ? {} : { trashed: args.trashed },
        })
        return JSON.stringify({ ok: true, created: false, note, summary: `已更新便签「${note.title}」` })
      } catch (error) {
        toolError(error)
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'desk_note_delete',
    description: 'Delete one desk note permanently. There is no undo, so only call it when the user asked to delete that note.',
    parameters: {
      id: { type: 'string', required: true, description: 'Note id from desk_note_list.' },
    },
    output: textOutput,
    async execute(args) {
      try {
        await store.deleteNote(args.id)
        return JSON.stringify({ ok: true, deleted: true, summary: '已删除便签' })
      } catch (error) {
        toolError(error)
      }
    },
  }))

  ctx.logger.info?.(`${PACKAGE_NAME}: registered 3 desk note tools`)
}
