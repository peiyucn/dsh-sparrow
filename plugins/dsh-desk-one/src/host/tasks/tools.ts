/**
 * Task tools for the agent surface.
 *
 * They share the DeskStore with the board UI: same validation, same revision guard. Listing is
 * limited by default so a large board cannot flood the model context. One `save` tool creates
 * (no id) or updates (id + revision); archive stays a separate reversible action.
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

/** Register the three task tools; the board UI refreshes on its next pull. */
export function registerTaskTools(ctx: Context, store: DeskStore): void {
  ctx.tools.register(defineTool({
    name: 'desk_task_list',
    description: 'List desk tasks in board order. Excludes archived tasks by default; optionally filter by lane and keyword. Use this before a save-update to obtain the current id and revision.',
    parameters: {
      status: { type: 'string', enum: TASK_STATUSES, description: 'Only tasks in this lane.' },
      query: { type: 'string', description: 'Case-insensitive keyword over title and body.' },
      group_id: { type: 'string', description: 'Only tasks in this group (desk_group_list gives ids); empty string = ungrouped.' },
      limit: { type: 'number', description: 'Maximum tasks to return (default 50, max 200).' },
      include_archived: { type: 'boolean', description: 'Include archived tasks (default false).' },
    },
    output: textOutput,
    execute(args) {
      const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(Math.floor(args.limit), 200) : 50
      const groupId = typeof args.group_id === 'string' ? args.group_id.trim() : undefined
      const tasks = store.listTasks(args.query)
        .filter(task => (args.status === undefined || task.status === args.status)
          && (args.include_archived === true || !task.archived)
          && (groupId === undefined || (groupId === '' ? task.groupId === undefined : task.groupId === groupId)))
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
    name: 'desk_task_save',
    description: 'Create or update one desk task. Omit id to create (title required); pass id + expected_revision to update title/description/lane/color/due date/order/group. "Done" is just status="done". Get id + revision from desk_task_list first.',
    parameters: {
      id: { type: 'string', description: 'Task id from desk_task_list; omit to create a new task.' },
      expected_revision: { type: 'number', description: 'Required when id is given: revision returned by desk_task_list.' },
      title: { type: 'string', description: 'Task title (at most 200 characters). Required when creating.' },
      body: { type: 'string', description: 'Optional description / notes (at most 20000 characters).' },
      status: { type: 'string', enum: TASK_STATUSES, description: 'Lane: todo (default), doing or done.' },
      color: { type: 'string', enum: NOTE_COLORS, description: 'Card color tag; defaults to "default".' },
      due_date: { type: 'string', description: 'Due date, YYYY-MM-DD.' },
      due_timezone: { type: 'string', description: 'IANA timezone for the due date (optional).' },
      clear_due: { type: 'boolean', description: 'Clear the due date instead of setting it (update only).' },
      order: { type: 'number', description: 'Manual order inside the lane (larger = later).' },
      group_id: { type: 'string', description: 'Group id (see desk_group_list); must belong to the same lane.' },
      clear_group: { type: 'boolean', description: 'Move the task out of its group (update only).' },
    },
    output: textOutput,
    async execute(args) {
      try {
        if (args.id === undefined) {
          if (typeof args.title !== 'string' || args.title.trim() === '') throw new Error('新建任务需要 title')
          const task = await store.createTask({
            title: args.title,
            body: args.body,
            status: args.status,
            color: args.color,
            dueDate: args.due_date,
            dueTimezone: args.due_timezone,
            order: args.order,
            groupId: args.group_id,
          })
          return JSON.stringify({ ok: true, created: true, task, summary: `已新建任务「${task.title}」` })
        }
        if (typeof args.expected_revision !== 'number') {
          throw new Error('更新任务需要 expected_revision：先调 desk_task_list 拿 id 和 revision')
        }
        const due = args.clear_due === true
          ? null
          : args.due_date === undefined ? undefined : { date: args.due_date, timezone: args.due_timezone }
        const groupId = args.clear_group === true ? null : args.group_id
        const task = await store.updateTask(args.id, args.expected_revision, {
          ...args.title === undefined ? {} : { title: args.title },
          ...args.body === undefined ? {} : { body: args.body },
          ...args.status === undefined ? {} : { status: args.status },
          ...args.color === undefined ? {} : { color: args.color },
          ...due === undefined ? {} : { due },
          ...args.order === undefined ? {} : { order: args.order },
          ...groupId === undefined ? {} : { groupId },
        })
        return JSON.stringify({ ok: true, created: false, task, summary: `已更新任务「${task.title}」` })
      } catch (error) {
        toolError(error)
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'desk_task_archive',
    description: 'Move one desk task to the board archive (or restore it). Archived tasks leave the board but stay recoverable. Use desk_task_list (include_archived) to get id + revision.',
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

  ctx.logger.info?.(`${PACKAGE_NAME}: registered 3 desk task tools`)
}
