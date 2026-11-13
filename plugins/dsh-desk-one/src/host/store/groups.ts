/** Task-group repository: one-level groups owned by a lane, including the lane/order cascades. */

import { randomUUID } from 'node:crypto'
import { TASK_STATUSES } from '../../constants.js'
import {
  DeskModelError, createGroupRecord, filterGroups, normalizeGroupInput, patchGroupRecord, sortGroups, type GroupPatch,
} from '../../model.js'
import type { DeskTask, DeskTaskGroup, TaskStatus } from '../../contract.js'
import type { StoreCore } from './core.js'

/** Creation input accepted by `createGroup` (unknown fields are validated by the model). */
export interface CreateGroupInput {
  readonly name?: unknown
  readonly status?: unknown
  readonly order?: unknown
}

export class GroupRepository {
  constructor(private readonly core: StoreCore) {}

  /** List groups in board order (all lanes unless the caller filters). */
  listGroups(query?: string, limit?: number): DeskTaskGroup[] {
    const groups = this.core.allNodes().filter((node): node is DeskTaskGroup => node.kind === 'group')
    const filtered = filterGroups(sortGroups(groups), query)
    if (limit === undefined) return filtered
    const bounded = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 0
    return bounded === 0 ? filtered : filtered.slice(0, bounded)
  }

  /** One group node by id (kind-narrowed; shared with the task repository's membership rules). */
  groupById(id: string): DeskTaskGroup | undefined {
    const node = this.core.nodes.get(id)
    return node !== undefined && node.kind === 'group' ? node : undefined
  }

  /** Groups of one lane in manual order (used to keep group order dense after edits). */
  private laneGroups(status: TaskStatus): DeskTaskGroup[] {
    return sortGroups(this.core.allNodes().filter(
      (node): node is DeskTaskGroup => node.kind === 'group' && node.status === status,
    ))
  }

  async createGroup(raw: CreateGroupInput): Promise<DeskTaskGroup> {
    const input = normalizeGroupInput(raw)
    if (this.laneGroups(input.status).some(group => !group.archived && group.name === input.name)) {
      throw new DeskModelError('INVALID_GROUP', `分组已存在：${input.name}`)
    }
    const active = this.laneGroups(input.status).filter(group => !group.archived)
    const order = raw.order === undefined ? active.length : input.order
    const group = createGroupRecord({ ...input, order }, { id: `group_${randomUUID()}`, now: new Date().toISOString() })
    await this.core.nodes.put(group.id, group)
    return group
  }

  /** Rename / reorder one group; lane moves go through `moveGroup` because they cascade to tasks. */
  async updateGroup(id: string, expectedRevision: number, patch: GroupPatch): Promise<DeskTaskGroup> {
    const now = new Date().toISOString()
    try {
      const updated = await this.core.nodes.update(id, (current) => {
        if (current.kind !== 'group') throw new DeskModelError('UNKNOWN_GROUP', `分组不存在：${id}`)
        const patched = patchGroupRecord(current, patch, { expectedRevision, now })
        if (patch.name !== undefined && this.laneGroups(current.status).some(
          group => group.id !== id && !group.archived && group.name === patched.name,
        )) {
          throw new DeskModelError('INVALID_GROUP', `分组已存在：${patched.name}`)
        }
        return patched
      })
      if (updated.kind !== 'group') throw new DeskModelError('UNKNOWN_GROUP', `分组不存在：${id}`)
      return updated
    } catch (error) {
      throw this.core.mapMissing(error, 'UNKNOWN_GROUP', `分组不存在：${id}`)
    }
  }

  /** Write dense 0..n-1 group orders; only records whose order actually changed are rewritten. */
  private async applyGroupOrders(ordered: readonly DeskTaskGroup[], now: string): Promise<DeskTaskGroup[]> {
    const updated: DeskTaskGroup[] = []
    for (const [index, group] of ordered.entries()) {
      if (group.order === index) {
        updated.push(group)
        continue
      }
      const next = await this.core.nodes.update(group.id, (current) => current.kind === 'group'
        ? { ...current, order: index, revision: current.revision + 1, updatedAt: now }
        : current)
      if (next.kind === 'group') updated.push(next)
    }
    return updated
  }

  /**
   * Move a group to a lane / position. Same-lane moves only reorder groups; cross-lane moves
   * cascade the new status to every member task (the group remains their container).
   */
  async moveGroup(
    id: string,
    expectedRevision: number,
    toStatus: string,
    toOrder?: number,
  ): Promise<{ group: DeskTaskGroup; tasks: DeskTask[] }> {
    const current = this.groupById(id)
    if (current === undefined) throw new DeskModelError('UNKNOWN_GROUP', `分组不存在：${id}`)
    if (!Number.isInteger(expectedRevision) || current.revision !== expectedRevision) {
      throw new DeskModelError(
        'REVISION_CONFLICT',
        `分组已被修改（当前 revision ${current.revision}，请求 ${expectedRevision}）`,
      )
    }
    if (current.archived) throw new DeskModelError('INVALID_GROUP', '已存档的分组不能移动，请先恢复')
    if (!(TASK_STATUSES as readonly string[]).includes(toStatus)) {
      throw new DeskModelError('INVALID_GROUP', `未知的泳道：${toStatus}`)
    }
    const status = toStatus as TaskStatus
    const now = new Date().toISOString()
    let movedGroup = current
    const updatedTasks: DeskTask[] = []

    if (current.status !== status) {
      const moved = await this.core.nodes.update(id, (node) => node.kind === 'group'
        ? { ...node, status, revision: node.revision + 1, updatedAt: now }
        : node)
      if (moved.kind === 'group') movedGroup = moved
      for (const task of this.core.allTasks().filter(task => task.groupId === id)) {
        const next = await this.core.nodes.update(task.id, (node) => node.kind === 'task'
          ? { ...node, status, revision: node.revision + 1, updatedAt: now }
          : node)
        if (next.kind === 'task') updatedTasks.push(next)
      }
      // Close the gap the group left behind in its old lane.
      await this.applyGroupOrders(this.laneGroups(current.status), now)
    }

    const target = this.laneGroups(status).filter(group => group.id !== id)
    const index = toOrder === undefined ? target.length : Math.max(0, Math.min(Math.round(toOrder), target.length))
    target.splice(index, 0, movedGroup)
    const ordered = await this.applyGroupOrders(target, now)
    return { group: ordered.find(group => group.id === id) ?? movedGroup, tasks: updatedTasks }
  }

  /** Archive / restore a group together with every card in it (archive is Done-lane only). */
  async archiveGroup(
    id: string,
    expectedRevision: number,
    archived: boolean,
  ): Promise<{ group: DeskTaskGroup; tasks: DeskTask[] }> {
    const current = this.groupById(id)
    if (current === undefined) throw new DeskModelError('UNKNOWN_GROUP', `分组不存在：${id}`)
    if (archived && current.status !== 'done') {
      throw new DeskModelError('INVALID_GROUP', '只有完成列的分组可以存档')
    }
    const now = new Date().toISOString()
    const updated = await this.core.nodes.update(id, (node) => node.kind === 'group'
      ? patchGroupRecord(node, { archived }, { expectedRevision, now })
      : node)
    if (updated.kind !== 'group') throw new DeskModelError('UNKNOWN_GROUP', `分组不存在：${id}`)
    const tasks: DeskTask[] = []
    for (const task of this.core.allTasks().filter(task => task.groupId === id)) {
      const next = await this.core.nodes.update(task.id, (node) => node.kind === 'task'
        ? { ...node, archived, revision: node.revision + 1, updatedAt: now }
        : node)
      if (next.kind === 'task') tasks.push(next)
    }
    return { group: updated, tasks }
  }

  /** Delete a group; its cards become ungrouped (explicit delete only — empty groups persist). */
  async deleteGroup(id: string): Promise<boolean> {
    const current = this.groupById(id)
    if (current === undefined) throw new DeskModelError('UNKNOWN_GROUP', `分组不存在：${id}`)
    const now = new Date().toISOString()
    if (current.archived) {
      // Archived groups own archived cards: permanent delete removes them too.
      for (const task of this.core.allTasks().filter(task => task.groupId === id)) {
        await this.core.nodes.delete(task.id)
      }
    } else {
      for (const task of this.core.allTasks().filter(task => task.groupId === id)) {
        await this.core.nodes.update(task.id, (node) => {
          if (node.kind !== 'task') return node
          const { groupId: _cleared, ...rest } = node
          return { ...rest, revision: node.revision + 1, updatedAt: now }
        })
      }
    }
    await this.core.nodes.delete(id)
    await this.applyGroupOrders(this.laneGroups(current.status), now)
    return true
  }
}
