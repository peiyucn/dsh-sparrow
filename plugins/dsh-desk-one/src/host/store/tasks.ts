/** Task repository: the board's cards plus the lane/group membership invariants. */

import { randomUUID } from 'node:crypto'
import {
  DeskModelError, createTaskRecord, filterTasks, normalizeTaskInput, patchTaskRecord, sortTasks, type TaskPatch,
} from '../../model.js'
import type { DeskTask } from '../../contract.js'
import type { GroupRepository } from './groups.js'
import type { StoreCore } from './core.js'

/** Creation input accepted by `createTask` (unknown fields are validated by the model). */
export interface CreateTaskInput {
  readonly title?: unknown
  readonly body?: unknown
  readonly status?: unknown
  readonly color?: unknown
  readonly dueDate?: unknown
  readonly dueTimezone?: unknown
  readonly order?: unknown
  readonly groupId?: unknown
}

export class TaskRepository {
  constructor(private readonly core: StoreCore, private readonly groups: GroupRepository) {}

  /** List tasks in board order; callers pass a limit on the tool surface. */
  listTasks(query?: string, limit?: number): DeskTask[] {
    const tasks = this.core.allNodes().filter((node): node is DeskTask => node.kind === 'task')
    const filtered = filterTasks(sortTasks(tasks), query)
    if (limit === undefined) return filtered
    const bounded = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 0
    return bounded === 0 ? filtered : filtered.slice(0, bounded)
  }

  /** Create a task; titles are required and validated in the model. */
  async createTask(raw: CreateTaskInput): Promise<DeskTask> {
    const input = normalizeTaskInput(raw)
    if (input.groupId !== undefined) {
      const group = this.groups.groupById(input.groupId)
      if (group === undefined) throw new DeskModelError('UNKNOWN_GROUP', `分组不存在：${input.groupId}`)
      if (group.archived) throw new DeskModelError('INVALID_GROUP', '不能把任务放进已存档的分组')
      if (group.status !== input.status) {
        throw new DeskModelError('INVALID_GROUP', '任务状态与所属分组的泳道不一致')
      }
    }
    const task = createTaskRecord(input, { id: `task_${randomUUID()}`, now: new Date().toISOString() })
    await this.core.nodes.put(task.id, task)
    return task
  }

  /**
   * Membership invariant: a task may only belong to a group in its own lane. A cross-lane status
   * move that leaves `groupId` untouched clears the membership (the group stays in its lane).
   */
  private reconcileTaskGroup(task: DeskTask, patch: TaskPatch): DeskTask {
    if (task.groupId === undefined) return task
    const group = this.groups.groupById(task.groupId)
    if (group === undefined) throw new DeskModelError('UNKNOWN_GROUP', `分组不存在：${task.groupId}`)
    if (group.archived && patch.groupId !== undefined) {
      throw new DeskModelError('INVALID_GROUP', '已存档的分组不能再收任务')
    }
    if (group.status === task.status) return task
    if (patch.groupId === undefined && patch.status !== undefined) {
      const { groupId: _cleared, ...rest } = task
      return rest
    }
    throw new DeskModelError('INVALID_GROUP', '任务状态与所属分组的泳道不一致')
  }

  /** Patch one task; revision mismatch -> REVISION_CONFLICT, missing -> UNKNOWN_TASK. */
  async updateTask(id: string, expectedRevision: number, patch: TaskPatch): Promise<DeskTask> {
    const now = new Date().toISOString()
    try {
      const updated = await this.core.nodes.update(id, (current) => {
        if (current.kind !== 'task') throw new DeskModelError('UNKNOWN_TASK', `任务不存在：${id}`)
        const next = patchTaskRecord(current, patch, { expectedRevision, now })
        // The board only archives Done cards; keep that invariant on the host surface too, because
        // the agent tool and REST routes can bypass the Done-lane-only UI action.
        if (next.archived && next.status !== 'done') {
          throw new DeskModelError('INVALID_TASK', '只有完成列的任务才能存档')
        }
        return this.reconcileTaskGroup(next, patch)
      })
      if (updated.kind !== 'task') throw new DeskModelError('UNKNOWN_TASK', `任务不存在：${id}`)
      return updated
    } catch (error) {
      throw this.core.mapMissing(error, 'UNKNOWN_TASK', `任务不存在：${id}`)
    }
  }

  /** Delete one task permanently. */
  async deleteTask(id: string): Promise<boolean> {
    const current = this.core.nodes.get(id)
    if (current === undefined || current.kind !== 'task') {
      throw new DeskModelError('UNKNOWN_TASK', `任务不存在：${id}`)
    }
    await this.core.nodes.delete(id)
    return true
  }
}
