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
import { MAX_ACTIVE_NOTES, MAX_TRASH_NOTES, NODES_TABLE, PACKAGE_NAME } from '../constants.js'
import {
  DeskModelError, createNoteRecord, createTaskRecord, filterNotes, filterTasks, normalizeCoordinate,
  normalizeLayer, normalizeNoteInput, normalizeTaskInput, patchNoteRecord, patchTaskRecord, sortNotes, sortTasks,
  type NotePatch, type TaskPatch,
} from '../model.js'
import type { DeskNode, DeskNote, DeskTask } from '../contract.js'

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
  }): Promise<DeskTask> {
    const input = normalizeTaskInput(raw)
    const task = createTaskRecord(input, { id: `task_${randomUUID()}`, now: new Date().toISOString() })
    await this.nodes.put(task.id, task)
    return task
  }

  /** Patch one task; revision mismatch -> REVISION_CONFLICT, missing -> UNKNOWN_TASK. */
  async updateTask(id: string, expectedRevision: number, patch: TaskPatch): Promise<DeskTask> {
    const now = new Date().toISOString()
    try {
      const updated = await this.nodes.update(id, (current) => {
        if (current.kind !== 'task') throw new DeskModelError('UNKNOWN_TASK', `任务不存在：${id}`)
        return patchTaskRecord(current, patch, { expectedRevision, now })
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

  /** Translate the domain's missing-key error into the feature-specific 404. */
  private mapMissing(error: unknown, code: 'UNKNOWN_NOTE' | 'UNKNOWN_TASK', message: string): unknown {
    if (error instanceof DomainError && error.code === 'missing-key') return new DeskModelError(code, message)
    return error
  }

  /** Close the storage domain (plugin unload / host shutdown, via the effect). */
  close(): Promise<void> {
    return this.domain.close()
  }
}
