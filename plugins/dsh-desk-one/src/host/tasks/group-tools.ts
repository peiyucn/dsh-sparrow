/**
 * Group tools for the agent surface. Groups are entities (not string labels): they can be empty,
 * renamed, reordered, and moving one to another lane cascades the lane status to its cards.
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { PACKAGE_NAME, TASK_STATUSES } from '../../constants.js'
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

/** Register the five group tools. */
export function registerGroupTools(ctx: Context, store: DeskStore): void {
  ctx.tools.register(defineTool({
    name: 'desk_group_add',
    description: 'Create a one-level task group inside a lane (todo / doing / done). Groups can be empty and are addressable by id.',
    parameters: {
      name: { type: 'string', required: true, description: 'Group name, unique within its lane (at most 80 characters).' },
      status: { type: 'string', enum: TASK_STATUSES, description: 'Lane that owns the group: todo (default), doing or done.' },
      order: { type: 'number', description: 'Position among the lane\'s groups (default: appended at the end).' },
    },
    output: textOutput,
    async execute(args) {
      try {
        const group = await store.createGroup(args)
        return JSON.stringify({ ok: true, group, summary: `已创建分组「${group.name}」` })
      } catch (error) {
        toolError(error)
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'desk_group_list',
    description: 'List desk task groups (all lanes by default), including empty ones, in board order.',
    parameters: {
      status: { type: 'string', enum: TASK_STATUSES, description: 'Only groups in this lane.' },
      query: { type: 'string', description: 'Case-insensitive keyword over group names.' },
      limit: { type: 'number', description: 'Maximum groups to return (default 100, max 500).' },
    },
    output: textOutput,
    execute(args) {
      const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(Math.floor(args.limit), 500) : 100
      const groups = store.listGroups(args.query)
        .filter(group => args.status === undefined || group.status === args.status)
        .slice(0, limit)
      return Promise.resolve(JSON.stringify({
        ok: true,
        total: groups.length,
        groups,
        summary: groups.length === 0 ? '没有分组' : `返回 ${groups.length} 个分组`,
      }))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'desk_group_update',
    description: 'Rename or reorder one task group. Use desk_group_list to get the current revision first.',
    parameters: {
      id: { type: 'string', required: true, description: 'Group id from desk_group_list.' },
      expected_revision: { type: 'number', required: true, description: 'Revision returned by desk_group_list.' },
      name: { type: 'string', description: 'New group name.' },
      order: { type: 'number', description: 'New position among the lane\'s groups.' },
    },
    output: textOutput,
    async execute(args) {
      try {
        const group = await store.updateGroup(args.id, args.expected_revision, {
          ...args.name === undefined ? {} : { name: args.name },
          ...args.order === undefined ? {} : { order: args.order },
        })
        return JSON.stringify({ ok: true, group, summary: `已更新分组「${group.name}」` })
      } catch (error) {
        toolError(error)
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'desk_group_move',
    description: 'Move a whole group to a lane / position. Moving it to another lane also moves every card in the group to that lane.',
    parameters: {
      id: { type: 'string', required: true, description: 'Group id from desk_group_list.' },
      expected_revision: { type: 'number', required: true, description: 'Revision returned by desk_group_list.' },
      status: { type: 'string', required: true, enum: TASK_STATUSES, description: 'Target lane.' },
      order: { type: 'number', description: 'Position among the target lane\'s groups (default: append).' },
    },
    output: textOutput,
    async execute(args) {
      try {
        const result = await store.moveGroup(args.id, args.expected_revision, args.status, args.order)
        return JSON.stringify({
          ok: true,
          group: result.group,
          movedTasks: result.tasks.length,
          tasks: result.tasks,
          summary: `已把分组「${result.group.name}」移到「${result.group.status}」${result.tasks.length === 0 ? '' : `，同时移动 ${result.tasks.length} 个任务`}`,
        })
      } catch (error) {
        toolError(error)
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'desk_group_delete',
    description: 'Delete one group permanently. Cards in it are kept and become ungrouped.',
    parameters: {
      id: { type: 'string', required: true, description: 'Group id from desk_group_list.' },
    },
    output: textOutput,
    execute(args) {
      return store.deleteGroup(args.id).then(() => JSON.stringify({
        ok: true,
        summary: '已删除分组，组内任务回到未分组',
      }))
    },
  }))

  ctx.logger.info?.(`${PACKAGE_NAME}: registered 5 desk group tools`)
}
