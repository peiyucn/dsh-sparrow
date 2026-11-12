/**
 * Group tools for the agent surface. Groups are entities (not string labels): they can be empty,
 * renamed, reordered, moved (which cascades the lane to their cards), archived and deleted.
 * One `save` tool creates (no id) or updates (id + revision); delete stays a separate tool.
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

/** Register the three group tools. */
export function registerGroupTools(ctx: Context, store: DeskStore): void {
  ctx.tools.register(defineTool({
    name: 'desk_group_list',
    description: 'List desk task groups (all lanes by default), including empty ones, in board order. Archived groups are excluded unless include_archived is set. Use this before group save/delete to obtain ids and revisions.',
    parameters: {
      status: { type: 'string', enum: TASK_STATUSES, description: 'Only groups in this lane.' },
      query: { type: 'string', description: 'Case-insensitive keyword over group names.' },
      include_archived: { type: 'boolean', description: 'Include archived groups (default false).' },
      limit: { type: 'number', description: 'Maximum groups to return (default 100, max 500).' },
    },
    output: textOutput,
    execute(args) {
      const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(Math.floor(args.limit), 500) : 100
      const groups = store.listGroups(args.query)
        .filter(group => args.status === undefined || group.status === args.status)
        .filter(group => args.include_archived === true || !group.archived)
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
    name: 'desk_group_save',
    description: 'Create or update one task group. Omit id to create (name required, lands in the given lane). With id + expected_revision: rename/reorder; pass status to move the group to another lane (its cards move too); pass archived to archive/restore a done-lane group. Get id + revision from desk_group_list first.',
    parameters: {
      id: { type: 'string', description: 'Group id from desk_group_list; omit to create a new group.' },
      expected_revision: { type: 'number', description: 'Required when id is given: revision returned by desk_group_list.' },
      name: { type: 'string', description: 'Group name, unique within its lane (at most 80 characters). Required when creating.' },
      status: { type: 'string', enum: TASK_STATUSES, description: 'Lane that owns the group (create) or target lane (move).' },
      order: { type: 'number', description: 'Position among the lane’s groups (default: appended).' },
      archived: { type: 'boolean', description: 'Archive (true) or restore (false) a done-lane group; update only.' },
    },
    output: textOutput,
    async execute(args) {
      try {
        if (args.id === undefined) {
          if (typeof args.name !== 'string' || args.name.trim() === '') throw new Error('新建分组需要 name')
          const group = await store.createGroup({ name: args.name, status: args.status, order: args.order })
          return JSON.stringify({ ok: true, created: true, group, summary: `已新建分组「${group.name}」` })
        }
        if (typeof args.expected_revision !== 'number') {
          throw new Error('更新分组需要 expected_revision：先调 desk_group_list 拿 id 和 revision')
        }
        if (args.archived !== undefined) {
          if (args.name !== undefined || args.status !== undefined) {
            throw new Error('归档 / 恢复分组不能同时改名或移动，请分开调用')
          }
          const result = await store.archiveGroup(args.id, args.expected_revision, args.archived !== false)
          return JSON.stringify({
            ok: true,
            created: false,
            group: result.group,
            tasks: result.tasks,
            summary: result.group.archived
              ? `已存档分组「${result.group.name}」（${result.tasks.length} 个任务）`
              : `已恢复分组「${result.group.name}」（${result.tasks.length} 个任务）`,
          })
        }
        if (args.status !== undefined) {
          let revision = args.expected_revision
          if (args.name !== undefined) {
            const renamed = await store.updateGroup(args.id, revision, { name: args.name })
            revision = renamed.revision
          }
          const result = await store.moveGroup(args.id, revision, args.status, args.order)
          return JSON.stringify({
            ok: true,
            created: false,
            group: result.group,
            movedTasks: result.tasks.length,
            tasks: result.tasks,
            summary: `已把分组「${result.group.name}」移到「${result.group.status}」${result.tasks.length === 0 ? '' : `，同时移动 ${result.tasks.length} 个任务`}`,
          })
        }
        const group = await store.updateGroup(args.id, args.expected_revision, {
          ...args.name === undefined ? {} : { name: args.name },
          ...args.order === undefined ? {} : { order: args.order },
        })
        return JSON.stringify({ ok: true, created: false, group, summary: `已更新分组「${group.name}」` })
      } catch (error) {
        toolError(error)
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'desk_group_delete',
    description: 'Delete one group permanently. Cards in an active group are kept and become ungrouped; deleting an archived group also deletes its archived cards.',
    parameters: {
      id: { type: 'string', required: true, description: 'Group id from desk_group_list.' },
    },
    output: textOutput,
    execute(args) {
      return store.deleteGroup(args.id).then(() => JSON.stringify({
        ok: true,
        summary: '已删除分组',
      }))
    },
  }))

  ctx.logger.info?.(`${PACKAGE_NAME}: registered 3 desk group tools`)
}
