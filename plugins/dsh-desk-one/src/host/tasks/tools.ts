

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { NOTE_COLORS, PACKAGE_NAME, TASK_STATUSES } from '../../constants.js'
import { normalizeSessionIds } from '../../model.js'
import { textOutput, toolError } from '../tools/shared.js'
import type { DeskStore } from '../store.js'


function normalizeUnlinkIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw new Error('unlink_session_ids 必须是字符串数组')
  const ids: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') throw new Error('unlink_session_ids 必须是字符串数组')
    const id = item.trim()
    if (id === '' || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  if (ids.length === 0) throw new Error('unlink_session_ids 至少需要一个会话 id')
  return ids
}


export function registerTaskTools(ctx: Context, store: DeskStore): void {
  ctx.tools.register(defineTool({
    name: 'desk_task_add',
    description: 'Add a task to the user\'s desk board (todo lane by default). Title is required; due date is day-granular (YYYY-MM-DD). Set link_current_session true to attach this conversation to the task.',
    parameters: {
      title: { type: 'string', required: true, description: 'Task title (at most 200 characters).' },
      body: { type: 'string', description: 'Optional description / notes (at most 20000 characters).' },
      status: { type: 'string', enum: TASK_STATUSES, description: 'Lane: todo (default), doing or done.' },
      color: { type: 'string', enum: NOTE_COLORS, description: 'Card color tag; defaults to "default".' },
      due_date: { type: 'string', description: 'Due date, YYYY-MM-DD.' },
      due_timezone: { type: 'string', description: 'IANA timezone for the due date (optional).' },
      order: { type: 'number', description: 'Manual order inside the lane (larger = later).' },
      group_id: { type: 'string', description: 'Optional group id (see desk_group_list); must belong to the same lane.' },
      link_current_session: { type: 'boolean', description: 'Link the conversation that called this tool to the new task (the session id is resolved from the tool context).' },
    },
    output: textOutput,
    async execute(args, exec) {
      try {
        const { group_id, link_current_session, due_date, due_timezone, ...rest } = args
        if (link_current_session === true && exec.agent === undefined) {
          throw new Error('当前工具调用没有会话上下文，无法关联本会话')
        }
        const sessionIds = link_current_session === true ? [String(exec.agent?.id)] : undefined
        const task = await store.createTask({
          ...rest,
          ...(due_date === undefined ? {} : { dueDate: due_date, dueTimezone: due_timezone }),
          groupId: group_id,
          ...(sessionIds === undefined ? {} : { sessionIds }),
        })
        return JSON.stringify({
          ok: true,
          task,
          summary: `已添加任务「${task.title}」${link_current_session === true ? '（已关联本会话）' : ''}`,
        })
      } catch (error) {
        toolError(error)
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'desk_task_list',
    description: 'List desk tasks in board order. Excludes archived tasks by default; optionally filter by lane, keyword, group, or the current conversation link.',
    parameters: {
      status: { type: 'string', enum: TASK_STATUSES, description: 'Only tasks in this lane.' },
      query: { type: 'string', description: 'Case-insensitive keyword over title and body.' },
      group_id: { type: 'string', description: 'Only tasks in this group (desk_group_list gives ids); empty string = ungrouped.' },
      limit: { type: 'number', description: 'Maximum tasks to return (default 50, max 200).' },
      include_archived: { type: 'boolean', description: 'Include archived tasks (default false).' },
      linked_to_current_session: { type: 'boolean', description: 'Only tasks linked to the conversation that called this tool (resolved from the tool context).' },
    },
    output: textOutput,
    execute(args, exec) {
      if (args.linked_to_current_session === true && exec.agent === undefined) {
        return Promise.reject(new Error('当前工具调用没有会话上下文，无法按本会话过滤'))
      }
      const currentSessionId = args.linked_to_current_session === true && exec.agent !== undefined ? String(exec.agent.id) : undefined
      const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(Math.floor(args.limit), 200) : 50
      const groupId = typeof args.group_id === 'string' ? args.group_id.trim() : undefined
      const tasks = store.listTasks(args.query)
        .filter(task => (args.status === undefined || task.status === args.status)
          && (args.include_archived === true || !task.archived)
          && (groupId === undefined || (groupId === '' ? task.groupId === undefined : task.groupId === groupId))
          && (currentSessionId === undefined || task.sessionIds.includes(currentSessionId)))
        .slice(0, limit)
      return Promise.resolve(JSON.stringify({
        ok: true,
        total: tasks.length,
        tasks,
        summary: tasks.length === 0
          ? '没有匹配的任务'
          : `返回 ${tasks.length} 条任务${args.include_archived === true ? '（含存档）' : '（默认不含存档）'}${currentSessionId === undefined ? '' : '（本会话）'}`,
      }))
    },
  }))


  ctx.tools.register(defineTool({
    name: 'desk_task_update',
    description: 'Update one desk task (title, description, lane, color, due date, order, group). Set link_current_session true to attach this conversation to an existing task; set unlink_current_session true or pass unlink_session_ids to detach linked sessions. Use desk_task_list to get the current revision and sessionIds first.',
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
      group_id: { type: 'string', description: 'Move the task into this group (must be in the target lane).' },
      clear_group: { type: 'boolean', description: 'Move the task out of its group.' },
      link_current_session: { type: 'boolean', description: 'Link the conversation that called this tool to the existing task (the session id is resolved from the tool context).' },
      unlink_current_session: { type: 'boolean', description: 'Remove the conversation that called this tool from the existing task.' },
      unlink_session_ids: { type: 'array', items: { type: 'string' }, description: 'Session ids to remove from the task (read sessionIds from desk_task_list). All listed ids must currently be linked; missing ids fail the whole update.' },
    },
    output: textOutput,
    async execute(args, exec) {
      try {
        const { link_current_session, unlink_current_session, unlink_session_ids, ...rest } = args
        const due = rest.clear_due === true
          ? null
          : rest.due_date === undefined ? undefined : { date: rest.due_date, timezone: rest.due_timezone }
        const groupId = rest.clear_group === true ? null : rest.group_id
        const unlinkIds = unlink_session_ids === undefined ? undefined : normalizeUnlinkIds(unlink_session_ids)
        const hasSessionEdit = link_current_session === true || unlink_current_session === true || unlinkIds !== undefined
        let sessionIds: readonly string[] | undefined
        if (hasSessionEdit) {
          if (link_current_session === true && unlink_current_session === true) {
            throw new Error('不能同时关联和解绑本会话')
          }
          if ((link_current_session === true || unlink_current_session === true) && exec.agent === undefined) {
            throw new Error('当前工具调用没有会话上下文，无法关联或解绑本会话')
          }
          const current = store.listTasks().find(task => task.id === args.id)
          if (current === undefined) throw new Error(`任务不存在：${args.id}`)
          let next: readonly string[] = [...current.sessionIds]
          if (unlinkIds !== undefined) {
            const missing = unlinkIds.filter(id => !current.sessionIds.includes(id))
            if (missing.length > 0) throw new Error(`任务未关联这些会话：${missing.join('、')}`)
            next = next.filter(id => !unlinkIds.includes(id))
          }
          if (unlink_current_session === true) {
            const currentSessionId = String(exec.agent?.id)
            if (!current.sessionIds.includes(currentSessionId)) throw new Error('本会话未关联该任务')
            next = next.filter(id => id !== currentSessionId)
          }
          if (link_current_session === true) {
            const currentSessionId = String(exec.agent?.id)
            if (unlinkIds?.includes(currentSessionId)) {
              throw new Error('unlink_session_ids 不能包含本会话，请只传 link_current_session')
            }
            next = normalizeSessionIds([...next, currentSessionId])
          } else {
            next = normalizeSessionIds(next)
          }
          sessionIds = next
        }
        const task = await store.updateTask(args.id, args.expected_revision, {
          ...rest.title === undefined ? {} : { title: rest.title },
          ...rest.body === undefined ? {} : { body: rest.body },
          ...rest.status === undefined ? {} : { status: rest.status },
          ...rest.color === undefined ? {} : { color: rest.color },
          ...due === undefined ? {} : { due },
          ...rest.order === undefined ? {} : { order: rest.order },
          ...groupId === undefined ? {} : { groupId },
          ...sessionIds === undefined ? {} : { sessionIds },
        })
        const notes: string[] = []
        if (link_current_session === true) notes.push('已关联本会话')
        if (unlink_current_session === true) notes.push('已解绑本会话')
        if (unlinkIds !== undefined) notes.push(`已解绑 ${unlinkIds.length} 个会话`)
        return JSON.stringify({
          ok: true,
          task,
          summary: `已更新任务「${task.title}」${notes.length === 0 ? '' : `（${notes.join('，')}）`}`,
        })
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
    description: 'Archive one done-lane desk task (or restore an archived one). Archived tasks leave the board but stay recoverable; only Done cards can be archived.',
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

  ctx.tools.register(defineTool({
    name: 'desk_task_delete',
    description: 'Permanently delete one desk task card. Only use when the user explicitly asks to delete the card; use desk_task_list to get the current revision first. Linked sessions and groups are not deleted.',
    parameters: {
      id: { type: 'string', required: true, description: 'Task id from desk_task_list.' },
      expected_revision: { type: 'number', required: true, description: 'Revision returned by desk_task_list.' },
    },
    output: textOutput,
    async execute(args) {
      try {
        const task = store.listTasks().find(candidate => candidate.id === args.id)
        if (task === undefined) throw new Error(`任务不存在：${args.id}`)
        if (task.revision !== args.expected_revision) {
          throw new Error(`任务已被修改（当前 revision ${task.revision}，请求 ${args.expected_revision}）`)
        }
        await store.deleteTask(args.id)
        return JSON.stringify({ ok: true, deleted: true, summary: `已删除任务「${task.title}」` })
      } catch (error) {
        toolError(error)
      }
    },
  }))

  ctx.logger.info?.(`${PACKAGE_NAME}: registered 6 desk task tools`)
}
