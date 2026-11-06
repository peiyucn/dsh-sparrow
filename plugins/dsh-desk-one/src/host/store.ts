/**
 * DeskStore: the host-side entry into the unified object model.
 *
 * All kinds share one `nodes` table; per-kind helpers narrow by `kind` so callers get a typed
 * record and cannot accidentally patch a note through a task API. Writes go through the storage
 * domain's serial write chain, and optimistic concurrency uses the per-object revision.
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { DomainError, type Domain } from '@deepseek-ai/dsh-storage-domain'
import { DESK_DOMAIN } from '../domain.js'
import { MAX_ACTIVE_NOTES, MAX_TRASH_NOTES, NODES_TABLE, PACKAGE_NAME, TASK_STATUSES } from '../constants.js'
import {
  DeskModelError, createGroupRecord, createNoteRecord, createTaskRecord, filterGroups, filterNotes, filterTasks,
  normalizeCoordinate, normalizeGroupInput, normalizeLayer, normalizeNoteInput, normalizeTaskInput, patchGroupRecord,
  patchNoteRecord, patchTaskRecord, sortGroups, sortNotes, sortTasks,
  type GroupPatch, type NotePatch, type TaskPatch,
} from '../model.js'
import type { DeskNode, DeskNote, DeskTask, DeskTaskGroup, TaskStatus } from '../contract.js'

type DeskDomain = Domain<typeof DESK_DOMAIN>

export class DeskStore {
  private constructor(private readonly domain: DeskDomain) {}

  /** Open the storage domain; log a user-facing warning before rethrowing (cordis marks us inactive). */
  static async open(ctx: Context): Promise<DeskStore> {
    try {
      const domain = await ctx.storageDomain.open(DESK_DOMAIN)
      return new DeskStore(domain)
    } catch (error) {
      ctx.logger.warn(
        `${PACKAGE_NAME}: 打开存储域失败：${error instanceof Error ? error.message : String(error)}；已停用插件以免影响 dsh`,
      )
      throw error
    }
  }

  /** The unified node table (all kinds share it; kind is the discriminator). */
  private get nodes() {
    return this.domain.table(NODES_TABLE)
  }

  private allNodes(): DeskNode[] {
    return [...this.nodes.entries()].map(([, node]) => node)
  }

  private allTasks(): DeskTask[] {
    return this.allNodes().filter((node): node is DeskTask => node.kind === 'task')
  }

  private groupById(id: string): DeskTaskGroup | undefined {
    const node = this.nodes.get(id)
    return node !== undefined && node.kind === 'group' ? node : undefined
  }

  /* ------------------------------- notes ------------------------------- */

  /** List notes (pinned first, newest first); an optional limit protects the agent tool context. */
  listNotes(query?: string, limit?: number): DeskNote[] {
    const notes = this.allNodes().filter((node): node is DeskNote => node.kind === 'note')
    const filtered = filterNotes(sortNotes(notes), query)
    if (limit === undefined) return filtered
    const bounded = Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_ACTIVE_NOTES + MAX_TRASH_NOTES) : 0
    return bounded === 0 ? filtered : filtered.slice(0, bounded)
  }

  /** Count notes by trash state (capacity guard; O(n) only on writes, and n is capped). */
  private countNotesByTrashed(trashed: boolean): number {
    let count = 0
    for (const node of this.allNodes()) {
      if (node.kind === 'note' && node.trashed === trashed) count += 1
    }
    return count
  }

  /** Create a note (validation / normalisation lives in the model). */
  async createNote(raw: {
    readonly title?: unknown
    readonly body?: unknown
    readonly color?: unknown
    readonly x?: unknown
    readonly y?: unknown
    readonly z?: unknown
  }): Promise<DeskNote> {
    // Product hard limit (owner decision): 100 on the wall, enforced host-side too.
    if (this.countNotesByTrashed(false) >= MAX_ACTIVE_NOTES) {
      throw new DeskModelError('NOTE_LIMIT', `便签墙最多放 ${MAX_ACTIVE_NOTES} 张便签`)
    }
    const input = normalizeNoteInput(raw)
    const note = createNoteRecord(input, {
      id: `note_${randomUUID()}`,
      now: new Date().toISOString(),
      x: normalizeCoordinate(raw.x),
      y: normalizeCoordinate(raw.y),
      z: normalizeLayer(raw.z),
    })
    await this.nodes.put(note.id, note)
    return note
  }

  /** Patch one note; revision mismatch -> REVISION_CONFLICT, missing -> UNKNOWN_NOTE. */
  async updateNote(id: string, expectedRevision: number, patch: NotePatch): Promise<DeskNote> {
    if (patch.trashed === true && this.countNotesByTrashed(true) >= MAX_TRASH_NOTES) {
      throw new DeskModelError('TRASH_FULL', `垃圾桶最多放 ${MAX_TRASH_NOTES} 张便签，请先清空垃圾桶`)
    }
    const now = new Date().toISOString()
    try {
      const updated = await this.nodes.update(id, (current) => {
        if (current.kind !== 'note') throw new DeskModelError('UNKNOWN_NOTE', `便签不存在：${id}`)
        return patchNoteRecord(current, patch, { expectedRevision, now })
      })
      if (updated.kind !== 'note') throw new DeskModelError('UNKNOWN_NOTE', `便签不存在：${id}`)
      return updated
    } catch (error) {
      throw this.mapMissing(error, 'UNKNOWN_NOTE', `便签不存在：${id}`)
    }
  }

  /** Delete one note permanently. */
  async deleteNote(id: string): Promise<boolean> {
    const current = this.nodes.get(id)
    if (current === undefined || current.kind !== 'note') {
      throw new DeskModelError('UNKNOWN_NOTE', `便签不存在：${id}`)
    }
    await this.nodes.delete(id)
    return true
  }

  /* ------------------------------- tasks ------------------------------- */

  /** List tasks in board order; callers pass a limit on the tool surface. */
  listTasks(query?: string, limit?: number): DeskTask[] {
    const tasks = this.allNodes().filter((node): node is DeskTask => node.kind === 'task')
    const filtered = filterTasks(sortTasks(tasks), query)
    if (limit === undefined) return filtered
    const bounded = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 0
    return bounded === 0 ? filtered : filtered.slice(0, bounded)
  }

  /** Create a task; titles are required and validated in the model. */
  async createTask(raw: {
    readonly title?: unknown
    readonly body?: unknown
    readonly status?: unknown
    readonly color?: unknown
    readonly dueDate?: unknown
    readonly dueTimezone?: unknown
    readonly order?: unknown
    readonly groupId?: unknown
  }): Promise<DeskTask> {
    const input = normalizeTaskInput(raw)
    if (input.groupId !== undefined) {
      const group = this.groupById(input.groupId)
      if (group === undefined) throw new DeskModelError('UNKNOWN_GROUP', `分组不存在：${input.groupId}`)
      if (group.status !== input.status) {
        throw new DeskModelError('INVALID_GROUP', '任务状态与所属分组的泳道不一致')
      }
    }
    const task = createTaskRecord(input, { id: `task_${randomUUID()}`, now: new Date().toISOString() })
    await this.nodes.put(task.id, task)
    return task
  }

  /**
   * Membership invariant: a task may only belong to a group in its own lane. A cross-lane status
   * move that leaves `groupId` untouched clears the membership (the group stays in its lane).
   */
  private reconcileTaskGroup(task: DeskTask, patch: TaskPatch): DeskTask {
    if (task.groupId === undefined) return task
    const group = this.groupById(task.groupId)
    if (group === undefined) throw new DeskModelError('UNKNOWN_GROUP', `分组不存在：${task.groupId}`)
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
      const updated = await this.nodes.update(id, (current) => {
        if (current.kind !== 'task') throw new DeskModelError('UNKNOWN_TASK', `任务不存在：${id}`)
        return this.reconcileTaskGroup(patchTaskRecord(current, patch, { expectedRevision, now }), patch)
      })
      if (updated.kind !== 'task') throw new DeskModelError('UNKNOWN_TASK', `任务不存在：${id}`)
      return updated
    } catch (error) {
      throw this.mapMissing(error, 'UNKNOWN_TASK', `任务不存在：${id}`)
    }
  }

  /** Delete one task permanently. */
  async deleteTask(id: string): Promise<boolean> {
    const current = this.nodes.get(id)
    if (current === undefined || current.kind !== 'task') {
      throw new DeskModelError('UNKNOWN_TASK', `任务不存在：${id}`)
    }
    await this.nodes.delete(id)
    return true
  }

  /* ------------------------------- groups ------------------------------- */

  /** List groups in board order (all lanes unless the caller filters). */
  listGroups(query?: string, limit?: number): DeskTaskGroup[] {
    const groups = this.allNodes().filter((node): node is DeskTaskGroup => node.kind === 'group')
    const filtered = filterGroups(sortGroups(groups), query)
    if (limit === undefined) return filtered
    const bounded = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 0
    return bounded === 0 ? filtered : filtered.slice(0, bounded)
  }

  /** Groups of one lane in manual order (used to keep group order dense after edits). */
  private laneGroups(status: TaskStatus): DeskTaskGroup[] {
    return sortGroups(this.allNodes().filter(
      (node): node is DeskTaskGroup => node.kind === 'group' && node.status === status,
    ))
  }

  async createGroup(raw: { readonly name?: unknown; readonly status?: unknown; readonly order?: unknown }): Promise<DeskTaskGroup> {
    const input = normalizeGroupInput(raw)
    if (this.laneGroups(input.status).some(group => group.name === input.name)) {
      throw new DeskModelError('INVALID_GROUP', `分组已存在：${input.name}`)
    }
    const order = raw.order === undefined ? this.laneGroups(input.status).length : input.order
    const group = createGroupRecord({ ...input, order }, { id: `group_${randomUUID()}`, now: new Date().toISOString() })
    await this.nodes.put(group.id, group)
    return group
  }

  /** Rename / reorder one group; lane moves go through `moveGroup` because they cascade to tasks. */
  async updateGroup(id: string, expectedRevision: number, patch: GroupPatch): Promise<DeskTaskGroup> {
    const now = new Date().toISOString()
    try {
      const updated = await this.nodes.update(id, (current) => {
        if (current.kind !== 'group') throw new DeskModelError('UNKNOWN_GROUP', `分组不存在：${id}`)
        const patched = patchGroupRecord(current, patch, { expectedRevision, now })
        if (patch.name !== undefined && this.laneGroups(current.status).some(
          group => group.id !== id && group.name === patched.name,
        )) {
          throw new DeskModelError('INVALID_GROUP', `分组已存在：${patched.name}`)
        }
        return patched
      })
      if (updated.kind !== 'group') throw new DeskModelError('UNKNOWN_GROUP', `分组不存在：${id}`)
      return updated
    } catch (error) {
      throw this.mapMissing(error, 'UNKNOWN_GROUP', `分组不存在：${id}`)
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
      const next = await this.nodes.update(group.id, (current) => current.kind === 'group'
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
    if (!(TASK_STATUSES as readonly string[]).includes(toStatus)) {
      throw new DeskModelError('INVALID_GROUP', `未知的泳道：${toStatus}`)
    }
    const status = toStatus as TaskStatus
    const now = new Date().toISOString()
    let movedGroup = current
    const updatedTasks: DeskTask[] = []

    if (current.status !== status) {
      const moved = await this.nodes.update(id, (node) => node.kind === 'group'
        ? { ...node, status, revision: node.revision + 1, updatedAt: now }
        : node)
      if (moved.kind === 'group') movedGroup = moved
      for (const task of this.allTasks().filter(task => task.groupId === id)) {
        const next = await this.nodes.update(task.id, (node) => node.kind === 'task'
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

  /** Delete a group; its cards become ungrouped (explicit delete only — empty groups persist). */
  async deleteGroup(id: string): Promise<boolean> {
    const current = this.groupById(id)
    if (current === undefined) throw new DeskModelError('UNKNOWN_GROUP', `分组不存在：${id}`)
    const now = new Date().toISOString()
    for (const task of this.allTasks().filter(task => task.groupId === id)) {
      await this.nodes.update(task.id, (node) => {
        if (node.kind !== 'task') return node
        const { groupId: _cleared, ...rest } = node
        return { ...rest, revision: node.revision + 1, updatedAt: now }
      })
    }
    await this.nodes.delete(id)
    await this.applyGroupOrders(this.laneGroups(current.status), now)
    return true
  }

  /** Translate the domain's missing-key error into the feature-specific 404. */
  private mapMissing(error: unknown, code: 'UNKNOWN_NOTE' | 'UNKNOWN_TASK' | 'UNKNOWN_GROUP', message: string): unknown {
    if (error instanceof DomainError && error.code === 'missing-key') return new DeskModelError(code, message)
    return error
  }

  /** Close the storage domain (plugin unload / host shutdown, via the effect). */
  close(): Promise<void> {
    return this.domain.close()
  }
}
