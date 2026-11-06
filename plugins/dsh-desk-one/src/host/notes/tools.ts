/**
 * Agent 工具面：与界面共用同一个 DeskStore（同一套对象、同一套校验），
 * 工具返回结构化 JSON + 一段人类可读摘要，便于模型直接复述。
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { PACKAGE_NAME, NOTE_COLORS } from '../../constants.js'
import type { DeskStore } from './store.js'

/** 工具输出统一用字符串（JSON 文本），render 原样交给对话区。 */
const textOutput = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

function toolError(error: unknown): never {
  if (error instanceof Error) throw error
  throw new Error(String(error))
}

/** 注册 S0 的四个便签工具；工具与 REST 路由共享 store，界面刷新靠下次拉取。 */
export function registerDeskTools(ctx: Context, store: DeskStore): void {
  ctx.tools.register(defineTool({
    name: 'desk_note_add',
    description: 'Add a note to the user\'s DSH desk (the notes wall). Use it for quick captures, ideas and reminders that are not tasks yet. Title is optional; when omitted it is derived from the first body line.',
    parameters: {
      title: { type: 'string', description: 'Short note title (at most 200 characters). Optional when body is given.' },
      body: { type: 'string', description: 'Note body, Markdown is allowed (at most 20000 characters).' },
      color: { type: 'string', enum: NOTE_COLORS, description: 'Color tag for the card; defaults to "default".' },
    },
    output: textOutput,
    async execute(args) {
      try {
        const note = await store.createNote(args)
        return JSON.stringify({ ok: true, note, summary: `已添加便签「${note.title}」` })
      } catch (error) {
        toolError(error)
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'desk_note_list',
    description: 'List the user\'s desk notes, pinned first and newest first within the same pin state. Optionally filter by a case-insensitive keyword over title and body.',
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
    name: 'desk_note_update',
    description: 'Update one desk note. Use desk_note_list first to obtain the current revision; revision mismatch is rejected so concurrent edits never overwrite each other.',
    parameters: {
      id: { type: 'string', required: true, description: 'Note id from desk_note_list.' },
      expected_revision: { type: 'number', required: true, description: 'The note revision returned by desk_note_list.' },
      title: { type: 'string', description: 'New title.' },
      body: { type: 'string', description: 'New body.' },
      color: { type: 'string', enum: NOTE_COLORS, description: 'New color tag.' },
      pinned: { type: 'boolean', description: 'Pin or unpin the note.' },
      trashed: { type: 'boolean', description: 'Move the note to the trash (true) or restore it (false).' },
    },
    output: textOutput,
    async execute(args) {
      try {
        const note = await store.updateNote(args.id, args.expected_revision, {
          ...args.title === undefined ? {} : { title: args.title },
          ...args.body === undefined ? {} : { body: args.body },
          ...args.color === undefined ? {} : { color: args.color },
          ...args.pinned === undefined ? {} : { pinned: args.pinned },
          ...args.trashed === undefined ? {} : { trashed: args.trashed },
        })
        return JSON.stringify({ ok: true, note, summary: `已更新便签「${note.title}」` })
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

  ctx.logger.info?.(`${PACKAGE_NAME}: registered 4 desk note tools`)
}
