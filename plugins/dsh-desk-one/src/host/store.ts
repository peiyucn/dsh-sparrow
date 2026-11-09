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
import { createSessionIndexRecord, sessionIndexId, type SessionIndexDraft } from './sessions/records.js'
import {
  MAX_ACTIVE_NOTES, MAX_TRASH_NOTES, NODES_TABLE, PACKAGE_NAME, SCHEDULE_COLORS, SESSION_INDEX_MISSING_DAYS,
  TASK_STATUSES,
} from '../constants.js'
import {
  DeskModelError, createGroupRecord, createNoteRecord, createTaskRecord, filterGroups, filterNotes, filterTasks,
  normalizeCoordinate, normalizeGroupInput, normalizeLayer, normalizeNoteInput, normalizeTaskInput, patchGroupRecord,
  patchNoteRecord, patchTaskRecord, sortGroups, sortNotes, sortTasks,
  type GroupPatch, type NotePatch, type TaskPatch,
} from '../model.js'
import {
  createCalendarRecord, createEventRecord, createScheduleSourceRecord, eventMatchesDraft, filterEvents,
  type CalendarDraft, type EventDraft, type EventQuery,
} from './schedule/records.js'
import type {
  DeskCalendar, DeskEvent, DeskNode, DeskNote, DeskScheduleSource, DeskSessionIndex, DeskTask, DeskTaskGroup, ScheduleSyncError, TaskStatus,
} from '../contract.js'

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
      if (group.archived) throw new DeskModelError('INVALID_GROUP', '不能把任务放进已存档的分组')
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
    if (this.laneGroups(input.status).some(group => !group.archived && group.name === input.name)) {
      throw new DeskModelError('INVALID_GROUP', `分组已存在：${input.name}`)
    }
    const active = this.laneGroups(input.status).filter(group => !group.archived)
    const order = raw.order === undefined ? active.length : input.order
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
          group => group.id !== id && !group.archived && group.name === patched.name,
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
    if (current.archived) throw new DeskModelError('INVALID_GROUP', '已存档的分组不能移动，请先恢复')
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
    const updated = await this.nodes.update(id, (node) => node.kind === 'group'
      ? patchGroupRecord(node, { archived }, { expectedRevision, now })
      : node)
    if (updated.kind !== 'group') throw new DeskModelError('UNKNOWN_GROUP', `分组不存在：${id}`)
    const tasks: DeskTask[] = []
    for (const task of this.allTasks().filter(task => task.groupId === id)) {
      const next = await this.nodes.update(task.id, (node) => node.kind === 'task'
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
      for (const task of this.allTasks().filter(task => task.groupId === id)) {
        await this.nodes.delete(task.id)
      }
    } else {
      for (const task of this.allTasks().filter(task => task.groupId === id)) {
        await this.nodes.update(task.id, (node) => {
          if (node.kind !== 'task') return node
          const { groupId: _cleared, ...rest } = node
          return { ...rest, revision: node.revision + 1, updatedAt: now }
        })
      }
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

  /* ------------------------------ schedule ------------------------------ */

  private allSources(): DeskScheduleSource[] {
    return this.allNodes().filter((node): node is DeskScheduleSource => node.kind === 'schedule-source')
  }

  private allCalendars(): DeskCalendar[] {
    return this.allNodes().filter((node): node is DeskCalendar => node.kind === 'calendar')
  }

  private allEvents(): DeskEvent[] {
    return this.allNodes().filter((node): node is DeskEvent => node.kind === 'event')
  }

  /** Sources in a stable provider order (wecom -> icloud -> outlook); one per provider+channel. */
  listScheduleSources(): DeskScheduleSource[] {
    const order: Record<string, number> = { wecom: 0, icloud: 1, outlook: 2 }
    return [...this.allSources()].sort((left, right) =>
      (order[left.provider] ?? 99) - (order[right.provider] ?? 99)
      || left.id.localeCompare(right.id))
  }

  /** Calendars grouped by source order first, then their manual order inside the source. */
  listCalendars(sourceId?: string): DeskCalendar[] {
    const sources = this.listScheduleSources()
    const sourceRank = new Map(sources.map((source, index) => [source.id, index]))
    return this.allCalendars()
      .filter(calendar => sourceId === undefined || calendar.sourceId === sourceId)
      .sort((left, right) =>
        (sourceRank.get(left.sourceId) ?? 99) - (sourceRank.get(right.sourceId) ?? 99)
        || left.order - right.order
        || left.id.localeCompare(right.id))
  }

  /** Find the connection record for one provider+channel (v1 keeps a single account per line). */
  findScheduleSource(provider: string, channel: string): DeskScheduleSource | undefined {
    return this.allSources().find(source => source.provider === provider && source.channel === channel)
  }

  /** Create one standalone source (used by ICS subscriptions: several sources per provider). */
  async createScheduleSource(input: {
    readonly provider: 'ics'
    readonly channel: 'ics'
    readonly account?: string
    readonly credentialRef: string
  }): Promise<DeskScheduleSource> {
    const now = new Date().toISOString()
    const record = createScheduleSourceRecord(input, { now })
    await this.nodes.put(record.id, record)
    return record
  }

  getScheduleSource(id: string): DeskScheduleSource | undefined {
    return this.allSources().find(source => source.id === id)
  }

  /** Create or refresh a connection record; secrets are never stored here (only the ref name). */
  async upsertScheduleSource(input: {
    readonly provider: 'wecom' | 'icloud' | 'outlook'
    readonly channel: 'caldav' | 'ics'
    readonly account?: string
    readonly credentialRef: string
  }): Promise<DeskScheduleSource> {
    const now = new Date().toISOString()
    const current = this.findScheduleSource(input.provider, input.channel)
    if (current !== undefined) {
      const updated = await this.nodes.update(current.id, (node) => {
        if (node.kind !== 'schedule-source') return node
        const next: DeskScheduleSource = {
          ...node,
          ...(input.account === undefined ? {} : { account: input.account }),
          credentialRef: input.credentialRef,
          enabled: true,
          syncState: 'idle',
          updatedAt: now,
          revision: node.revision + 1,
        }
        const { lastError: _cleared, ...rest } = next
        return rest
      })
      if (updated.kind !== 'schedule-source') throw new DeskModelError('INVALID_SCHEDULE', '日程连接不存在')
      return updated
    }
    const source = createScheduleSourceRecord(
      { provider: input.provider, channel: input.channel, account: input.account, credentialRef: input.credentialRef },
      { now },
    )
    await this.nodes.put(source.id, source)
    return source
  }

  /** Persist sync state / error on a source or calendar record. */
  async setScheduleSyncState(
    id: string,
    patch: { readonly syncState?: 'idle' | 'syncing' | 'error'; readonly lastSyncedAt?: string; readonly lastError?: ScheduleSyncError },
  ): Promise<void> {
    const now = new Date().toISOString()
    await this.nodes.update(id, (node) => {
      if (node.kind === 'schedule-source') {
        const next: DeskScheduleSource = {
          ...node,
          updatedAt: now,
          revision: node.revision + 1,
          ...(patch.syncState === undefined ? {} : { syncState: patch.syncState }),
          ...(patch.lastSyncedAt === undefined ? {} : { lastSyncedAt: patch.lastSyncedAt }),
          ...(patch.lastError === undefined ? {} : { lastError: patch.lastError }),
        }
        if (patch.lastError === undefined && patch.lastSyncedAt !== undefined) {
          const { lastError: _cleared, ...rest } = next
          return rest
        }
        return next
      }
      if (node.kind === 'calendar') {
        const next: DeskCalendar = {
          ...node,
          updatedAt: now,
          revision: node.revision + 1,
          ...(patch.lastSyncedAt === undefined ? {} : { lastSyncedAt: patch.lastSyncedAt }),
          ...(patch.lastError === undefined ? {} : { lastError: patch.lastError }),
        }
        if (patch.lastError === undefined && patch.lastSyncedAt !== undefined) {
          const { lastError: _cleared, ...rest } = next
          return rest
        }
        return next
      }
      return node
    })
  }

  /** Upsert the remote calendars of one source; existing rows keep the user's colour / visibility. */
  async upsertCalendars(source: DeskScheduleSource, drafts: readonly CalendarDraft[]): Promise<DeskCalendar[]> {
    const now = new Date().toISOString()
    const existing = this.allCalendars().filter(calendar => calendar.sourceId === source.id)
    const byRemote = new Map(existing.map(calendar => [calendar.remoteId, calendar]))
    let nextOrder = existing.reduce((max, calendar) => Math.max(max, calendar.order + 1), 0)
    for (const draft of drafts) {
      const current = byRemote.get(draft.remoteId)
      if (current === undefined) {
        const created = createCalendarRecord(
          { ...draft, sourceId: source.id, provider: source.provider, channel: source.channel, order: nextOrder },
          { now },
        )
        nextOrder += 1
        await this.nodes.put(created.id, created)
        continue
      }
      // Renames come from the remote; colour / order / visibility stay local decisions.
      if (current.displayName === draft.displayName) continue
      await this.nodes.update(current.id, (node) => node.kind === 'calendar'
        ? { ...node, displayName: draft.displayName, updatedAt: now, revision: node.revision + 1 }
        : node)
    }
    return this.listCalendars(source.id)
  }

  /** Local-only metadata patch (colour / visibility / order); remote data is untouched. */
  async updateCalendar(
    id: string,
    expectedRevision: number,
    patch: { readonly color?: unknown; readonly enabled?: unknown; readonly order?: unknown },
  ): Promise<DeskCalendar> {
    const now = new Date().toISOString()
    const updated = await this.nodes.update(id, (node) => {
      if (node.kind !== 'calendar') throw new DeskModelError('UNKNOWN_CALENDAR', `日历不存在：${id}`)
      if (node.revision !== expectedRevision) {
        throw new DeskModelError('REVISION_CONFLICT', `日历已被修改（当前 revision ${node.revision}）`)
      }
      let color = node.color
      if (patch.color !== undefined) {
        if (typeof patch.color !== 'string' || !(SCHEDULE_COLORS as readonly string[]).includes(patch.color)) {
          throw new DeskModelError('INVALID_SCHEDULE', '未知的日历颜色')
        }
        color = patch.color as DeskCalendar['color']
      }
      let enabled = node.enabled
      if (patch.enabled !== undefined) {
        if (typeof patch.enabled !== 'boolean') throw new DeskModelError('INVALID_SCHEDULE', 'enabled 必须是布尔值')
        enabled = patch.enabled
      }
      let order = node.order
      if (patch.order !== undefined) {
        if (typeof patch.order !== 'number' || !Number.isInteger(patch.order) || patch.order < 0) {
          throw new DeskModelError('INVALID_SCHEDULE', 'order 必须是非负整数')
        }
        order = patch.order
      }
      return { ...node, color, enabled, order, updatedAt: now, revision: node.revision + 1 }
    })
    if (updated.kind !== 'calendar') throw new DeskModelError('UNKNOWN_CALENDAR', `日历不存在：${id}`)
    return updated
  }

  /**
   * Replace the mirrored events of one calendar with a fresh pull.
   * The adapter supplies the full mirror window, so events absent from the pull are stale and get
   * removed (the mirror has no user-owned data; soft delete would only grow tombstones).
   */
  async syncCalendarEvents(calendar: DeskCalendar, drafts: readonly EventDraft[]): Promise<number> {
    const now = new Date().toISOString()
    const existing = this.allEvents().filter(event => event.calendarNodeId === calendar.id)
    const byExternal = new Map(existing.map(event => [event.externalId, event]))
    const seen = new Set<string>()
    let written = 0
    for (const draft of drafts) {
      if (draft.externalId === '' || draft.uid === '') continue
      if (seen.has(draft.externalId)) continue
      seen.add(draft.externalId)
      const current = byExternal.get(draft.externalId)
      if (current === undefined) {
        const created = createEventRecord(draft, {
          calendarNodeId: calendar.id,
          provider: calendar.provider,
          channel: calendar.channel,
          calendarRemoteId: calendar.remoteId,
          now,
        })
        await this.nodes.put(created.id, created)
      } else if (!eventMatchesDraft(current, draft)) {
        await this.nodes.update(current.id, (node) => node.kind === 'event'
          ? {
              ...createEventRecord(draft, {
                calendarNodeId: calendar.id,
                provider: calendar.provider,
                channel: calendar.channel,
                calendarRemoteId: calendar.remoteId,
                now,
                id: node.id,
              }),
              revision: node.revision + 1,
              createdAt: node.createdAt,
            }
          : node)
      }
      written += 1
    }
    for (const [externalId, event] of byExternal) {
      if (!seen.has(externalId)) await this.nodes.delete(event.id)
    }
    return written
  }

  /** Remove a connection record plus its calendars and mirrored events (local only). */
  async removeScheduleSource(sourceId: string): Promise<void> {
    const calendars = this.allCalendars().filter(calendar => calendar.sourceId === sourceId)
    const calendarIds = new Set(calendars.map(calendar => calendar.id))
    for (const event of this.allEvents()) {
      if (calendarIds.has(event.calendarNodeId)) await this.nodes.delete(event.id)
    }
    for (const calendar of calendars) await this.nodes.delete(calendar.id)
    await this.nodes.delete(sourceId)
  }

  /** Range query over mirrored events (the only read path for the schedule views). */
  listEvents(query: EventQuery): DeskEvent[] {
    return filterEvents(this.allEvents(), query)
  }

  /** Event count per calendar (shown in the calendar-source panel). */
  countEventsByCalendar(): Map<string, number> {
    const counts = new Map<string, number>()
    for (const event of this.allEvents()) {
      counts.set(event.calendarNodeId, (counts.get(event.calendarNodeId) ?? 0) + 1)
    }
    return counts
  }

  /** Session index: refresh from host headers; never copies session content. */
  async upsertSessionIndexes(drafts: readonly SessionIndexDraft[]): Promise<{ indexed: number; missing: number }> {
    const now = new Date().toISOString()
    const seen = new Set<string>()
    let indexed = 0
    for (const draft of drafts) {
      const id = sessionIndexId(draft.sessionId)
      seen.add(id)
      const current = this.nodes.get(id)
      if (current === undefined) {
        await this.nodes.put(id, createSessionIndexRecord(draft, { now }))
        indexed += 1
        continue
      }
      if (current.kind !== 'session') continue
      await this.nodes.update(id, (node) => node.kind === 'session'
        ? {
            ...node,
            title: draft.title,
            ...(draft.cwd === undefined ? {} : { cwd: draft.cwd }),
            ...(draft.parentSessionId === undefined ? {} : { parentSessionId: draft.parentSessionId }),
            subagent: draft.subagent,
            running: draft.running,
            availability: draft.availability,
            updatedAt: draft.updatedAt,
            indexedAt: now,
            revision: node.revision + 1,
          }
        : node)
      indexed += 1
    }
    let missing = 0
    const cutoff = Date.now() - SESSION_INDEX_MISSING_DAYS * 86_400_000
    for (const node of this.allNodes()) {
      if (node.kind !== 'session' || seen.has(node.id)) continue
      const missingSince = node.missingSince ?? now
      if (Date.parse(missingSince) < cutoff) {
        await this.nodes.delete(node.id)
        continue
      }
      missing += 1
      await this.nodes.update(node.id, current => current.kind === 'session'
        ? { ...current, availability: 'missing', missingSince, running: false, revision: current.revision + 1 }
        : current)
    }
    return { indexed, missing }
  }

  listSessionIndexes(query?: string, limit?: number): DeskSessionIndex[] {
    const needle = (query ?? '').trim().toLowerCase()
    const all = this.allNodes()
      .filter((node): node is DeskSessionIndex => node.kind === 'session' && node.availability !== 'missing')
      .filter(node => needle === ''
        || node.title.toLowerCase().includes(needle)
        || node.sessionId.toLowerCase().includes(needle)
        || (node.cwd ?? '').toLowerCase().includes(needle))
      .sort((left, right) => Number(right.running) - Number(left.running)
        || right.updatedAt - left.updatedAt
        || left.title.localeCompare(right.title))
    const bounded = limit === undefined ? 20 : Math.min(Math.max(0, limit), 100)
    return all.slice(0, bounded)
  }

  findSessionIndex(sessionId: string): DeskSessionIndex | undefined {
    const node = this.nodes.get(sessionIndexId(sessionId))
    return node?.kind === 'session' ? node : undefined
  }

  /** Close the storage domain (plugin unload / host shutdown, via the effect). */
  close(): Promise<void> {
    return this.domain.close()
  }
}
