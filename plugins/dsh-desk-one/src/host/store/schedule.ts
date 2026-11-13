/** Schedule repository: connection records, calendars, and the read-only mirrored events. */

import { SCHEDULE_COLORS } from '../../constants.js'
import { DeskModelError } from '../../model.js'
import {
  createCalendarRecord, createEventRecord, createScheduleSourceRecord, eventMatchesDraft, filterEvents,
  type CalendarDraft, type EventDraft, type EventQuery,
} from '../schedule/records.js'
import type { DeskCalendar, DeskEvent, DeskScheduleSource, ScheduleSyncError } from '../../contract.js'
import type { StoreCore } from './core.js'

/** Input of `createScheduleSource`: one standalone ICS endpoint (no account state). */
export interface CreateScheduleSourceInput {
  readonly provider: 'ics'
  readonly channel: 'ics'
  readonly account?: string
  readonly credentialRef: string
}

/** Input of `upsertScheduleSource`: one connection line, identified by provider + channel. */
export interface UpsertScheduleSourceInput {
  readonly provider: 'wecom' | 'icloud' | 'outlook' | 'ics'
  readonly channel: 'caldav' | 'ics' | 'graph'
  readonly account?: string
  readonly credentialRef: string
}

export class ScheduleRepository {
  constructor(private readonly core: StoreCore) {}

  private allSources(): DeskScheduleSource[] {
    return this.core.allNodes().filter((node): node is DeskScheduleSource => node.kind === 'schedule-source')
  }

  private allCalendars(): DeskCalendar[] {
    return this.core.allNodes().filter((node): node is DeskCalendar => node.kind === 'calendar')
  }

  private allEvents(): DeskEvent[] {
    return this.core.allNodes().filter((node): node is DeskEvent => node.kind === 'event')
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
  async createScheduleSource(input: CreateScheduleSourceInput): Promise<DeskScheduleSource> {
    const now = new Date().toISOString()
    const record = createScheduleSourceRecord(input, { now })
    await this.core.nodes.put(record.id, record)
    return record
  }

  getScheduleSource(id: string): DeskScheduleSource | undefined {
    return this.allSources().find(source => source.id === id)
  }

  /** Create or refresh a connection record; secrets are never stored here (only the ref name). */
  async upsertScheduleSource(input: UpsertScheduleSourceInput): Promise<DeskScheduleSource> {
    const now = new Date().toISOString()
    const current = this.findScheduleSource(input.provider, input.channel)
    if (current !== undefined) {
      const updated = await this.core.nodes.update(current.id, (node) => {
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
    await this.core.nodes.put(source.id, source)
    return source
  }

  /** Persist sync state / error on a source or calendar record. */
  async setScheduleSyncState(
    id: string,
    patch: { readonly syncState?: 'idle' | 'syncing' | 'error'; readonly lastSyncedAt?: string; readonly lastError?: ScheduleSyncError },
  ): Promise<void> {
    const now = new Date().toISOString()
    await this.core.nodes.update(id, (node) => {
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
        await this.core.nodes.put(created.id, created)
        continue
      }
      // Renames come from the remote; colour / order / visibility stay local decisions.
      if (current.displayName === draft.displayName) continue
      await this.core.nodes.update(current.id, (node) => node.kind === 'calendar'
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
    const updated = await this.core.nodes.update(id, (node) => {
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
        await this.core.nodes.put(created.id, created)
      } else if (!eventMatchesDraft(current, draft)) {
        await this.core.nodes.update(current.id, (node) => node.kind === 'event'
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
      if (!seen.has(externalId)) await this.core.nodes.delete(event.id)
    }
    return written
  }

  /** Remove a connection record plus its calendars and mirrored events (local only). */
  async removeScheduleSource(sourceId: string): Promise<void> {
    const calendars = this.allCalendars().filter(calendar => calendar.sourceId === sourceId)
    const calendarIds = new Set(calendars.map(calendar => calendar.id))
    for (const event of this.allEvents()) {
      if (calendarIds.has(event.calendarNodeId)) await this.core.nodes.delete(event.id)
    }
    for (const calendar of calendars) await this.core.nodes.delete(calendar.id)
    await this.core.nodes.delete(sourceId)
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
}
