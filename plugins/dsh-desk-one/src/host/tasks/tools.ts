/**
 * Task tools for the agent surface.
 *
 * They share the DeskStore with the board UI: same validation, same revision guard. Listing is
 * limited by default so a large board cannot flood the model context.
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { NOTE_COLORS, PACKAGE_NAME, TASK_STATUSES } from '../../constants.js'
import type { DeskStore } from '../store.js'

/** Tool output is plain JSON text (rendered verbatim in the transcript). */
const textOutput = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

function toolError(error: unknown): never {
  if (error instanceof Error) throw error
  throw new Error(String(error))
}

/** Register the five task tools; the board UI refreshes on its next pull. */
export function registerTaskTools(ctx: Context, store: DeskStore): void {
  ctx.tools.register(defineTool({
    name: 'desk_task_add',
    description: 'Add a task to the user\'s desk board (todo lane by default). Title is required; due date is day-granular (YYYY-MM-DD).',
    parameters: {
      title: { type: 'string', required: true, description: 'Task title (at most 200 characters).' },
      body: { type: 'string', description: 'Optional description / notes (at most 20000 characters).' },
      status: { type: 'string', enum: TASK_STATUSES, description: 'Lane: todo (default), doing or done.' },
      color: { type: 'string', enum: NOTE_COLORS, description: 'Card color tag; defaults to "default".' },
      due_date: { type: 'string', description: 'Due date, YYYY-MM-DD.' },
      due_timezone: { type: 'string', description: 'IANA timezone for the due date (optional).' },
      order: { type: 'number', description: 'Manual order inside the lane (larger = later).' },
      group: { type: 'string', description: 'Optional one-level group name (blank = ungrouped).' },
    },
    output: textOutput,
    async execute(args) {
      try {
        const task = await store.createTask(args)
        return JSON.stringify({ ok: true, task, summary: `已添加任务「${task.title}」` })
      } catch (error) {
        toolError(error)
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'desk_task_list',
    description: 'List desk tasks in board order. Excludes archived tasks by default; optionally filter by lane and keyword.',
    parameters: {
      status: { type: 'string', enum: TASK_STATUSES, description: 'Only tasks in this lane.' },
      query: { type: 'string', description: 'Case-insensitive keyword over title and body.' },
      group: { type: 'string', description: 'Only tasks in this one-level group; pass an empty string for ungrouped tasks.' },
      limit: { type: 'number', description: 'Maximum tasks to return (default 50, max 200).' },
      include_archived: { type: 'boolean', description: 'Include archived tasks (default false).' },
    },
    output: textOutput,
    execute(args) {
      const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(Math.floor(args.limit), 200) : 50
      const group = typeof args.group === 'string' ? args.group.trim() : undefined
      const tasks = store.listTasks(args.query)
        .filter(task => (args.status === undefined || task.status === args.status)
          && (args.include_archived === true || !task.archived)
          && (group === undefined || (group === '' ? task.group === undefined : task.group === group)))
        .slice(0, limit)
      return Promise.resolve(JSON.stringify({
        ok: true,
        total: tasks.length,
        tasks,
        summary: tasks.length === 0 ? '没有匹配的任务' : `返回 ${tasks.length} 条任务（默认不含存档）`,
      }))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'desk_task_update',
    description: 'Update one desk task (title, description, lane, color, due date, order). Use desk_task_list to get the current revision first.',
    parameters: {
      id: { type: 'string', required: true, description: 'Task id from desk_task_list.' },
      expected_revision: { type: 'number', required: true, description: 'Revision returned by desk_task_list.' },
      title: { type: 'string', description: 'New title.' },
      body: { type: 'string', description: 'New description.' },
      status: { type: 'string', enum: TASK_STATUSES, description: 'Move the task to this lane.' },
      color: { type: 'string', enum: NOTE_COLORS, description: 'New color tag.' },
      due_date: { type: 'string', description: 'New due date (YYYY-MM-DD).' },
      due_timezone: { type: 'string', description: 'IANA timezone for the due date.' },
      clear_due: { type: 'boolean', description: 'Clear the due date instead of setting it.' },
      order: { type: 'number', description: 'New manual order in the lane.' },
      group: { type: 'string', description: 'Move the task into this one-level group.' },
      clear_group: { type: 'boolean', description: 'Move the task out of its group.' },
    },
    output: textOutput,
    async execute(args) {
      try {
        const due = args.clear_due === true
          ? null
          : args.due_date === undefined ? undefined : { date: args.due_date, timezone: args.due_timezone }
        const group = args.clear_group === true ? null : args.group
        const task = await store.updateTask(args.id, args.expected_revision, {
          ...args.title === undefined ? {} : { title: args.title },
          ...args.body === undefined ? {} : { body: args.body },
          ...args.status === undefined ? {} : { status: args.status },
          ...args.color === undefined ? {} : { color: args.color },
          ...due === undefined ? {} : { due },
          ...args.order === undefined ? {} : { order: args.order },
          ...group === undefined ? {} : { group },
        })
        return JSON.stringify({ ok: true, task, summary: `已更新任务「${task.title}」` })
      } catch (error) {
        toolError(error)
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'desk_task_complete',
    description: 'Mark one desk task as done. Use desk_task_list to get the current revision first.',
    parameters: {
      id: { type: 'string', required: true, description: 'Task id from desk_task_list.' },
      expected_revision: { type: 'number', required: true, description: 'Revision returned by desk_task_list.' },
    },
    output: textOutput,
    async execute(args) {
      try {
        const task = await store.updateTask(args.id, args.expected_revision, { status: 'done' })
        return JSON.stringify({ ok: true, task, summary: `已完成任务「${task.title}」` })
      } catch (error) {
        toolError(error)
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'desk_task_archive',
    description: 'Move one desk task to the board archive (or restore it). Archived tasks leave the board but stay recoverable.',
    parameters: {
      id: { type: 'string', required: true, description: 'Task id from desk_task_list (pass include_archived to see them).' },
      expected_revision: { type: 'number', required: true, description: 'Revision returned by desk_task_list.' },
      archived: { type: 'boolean', description: 'true archives (default), false restores.' },
    },
    output: textOutput,
    async execute(args) {
      try {
        const task = await store.updateTask(args.id, args.expected_revision, { archived: args.archived !== false })
        return JSON.stringify({ ok: true, task, summary: task.archived ? `已存档任务「${task.title}」` : `已恢复任务「${task.title}」` })
      } catch (error) {
        toolError(error)
      }
    },
  }))

  ctx.logger.info?.(`${PACKAGE_NAME}: registered 5 desk task tools`)
}
