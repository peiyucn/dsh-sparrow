/**
 * Schedule host facade: the public schedule surface used by the REST routes and the agent tools.
 * The implementation is split by concern — credentials / connection CRUD (`connections.ts`), sync
 * orchestration (`sync.ts`) and Outlook OAuth + token cache (`outlook-oauth.ts`); this file only
 * wires the three together and keeps the read-only store projections (`state` / `events`).
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ScheduleProvider } from '../../constants.js'
import type {
  DeskCalendar, OutlookLoginPollResponse, OutlookLoginStartResponse, ScheduleConnectionInput,
  ScheduleConnectionTestResponse, ScheduleEventListResponse, ScheduleStateResponse,
  ScheduleSubscriptionInput, ScheduleSyncResponse,
} from '../../contract.js'
import { DeskError } from '../http.js'
import type { DeskStore } from '../store.js'
import { ScheduleConnections } from './connections.js'
import { OutlookOAuth } from './outlook-oauth.js'
import { ScheduleSync } from './sync.js'

export class ScheduleHost {
  private readonly oauth: OutlookOAuth
  private readonly connections: ScheduleConnections
  private readonly syncer: ScheduleSync

  constructor(ctx: Context, private readonly store: DeskStore) {
    this.oauth = new OutlookOAuth(ctx, store, {
      state: () => this.state(),
      syncSource: source => this.syncer.syncSource(source),
    })
    this.syncer = new ScheduleSync(ctx, store, {
      graphToken: source => this.oauth.graphToken(source),
    })
    this.connections = new ScheduleConnections(ctx, store, {
      clearGraphAccess: () => this.oauth.clearGraphAccess(),
      state: () => this.state(),
      syncSource: source => this.syncer.syncSource(source),
    })
  }

  /** Browser redirect login (default) or device code (fallback). */
  async startOutlookLogin(redirectUri?: string): Promise<OutlookLoginStartResponse> {
    return this.oauth.startOutlookLogin(redirectUri)
  }

  async pollOutlookLogin(flowId: unknown): Promise<OutlookLoginPollResponse> {
    return this.oauth.pollOutlookLogin(flowId)
  }

  /** OAuth redirect callback: exchange the code, persist the refresh token, warm one sync. */
  async completeOutlookLogin(code: unknown, state: unknown): Promise<{ ok: boolean; message: string }> {
    return this.oauth.completeOutlookLogin(code, state)
  }

  async disconnectOutlookGraph(): Promise<ScheduleStateResponse> {
    return this.connections.disconnectOutlookGraph()
  }

  /** Connection records + calendars + per-calendar counts for the schedule page. */
  state(): ScheduleStateResponse {
    const counts = this.store.countEventsByCalendar()
    const calendars = this.store.listCalendars()
    return {
      sources: this.store.listScheduleSources(),
      calendars,
      counts: Object.fromEntries([...counts.entries()]),
    }
  }

  /** Range events for the list / month / week views. */
  events(from: string, to: string, calendarIds?: readonly string[], provider?: ScheduleProvider): ScheduleEventListResponse {
    if (!Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || from >= to) {
      throw new DeskError('INVALID_SCHEDULE', '时间区间不合法', 400)
    }
    const events = this.store.listEvents({ from, to, calendarIds, provider })
    return { events, from, to }
  }

  /** Test without saving: discovery + one calendar list, or one ICS fetch + parse. */
  async test(input: ScheduleConnectionInput): Promise<ScheduleConnectionTestResponse> {
    return this.connections.test(input)
  }

  /** Save (or replace) one connection, then try one sync; sync failure is recorded, not thrown. */
  async saveConnection(input: ScheduleConnectionInput): Promise<ScheduleStateResponse> {
    return this.connections.saveConnection(input)
  }

  /** Remove one connection plus its calendars and mirrored events (local only; remote untouched). */
  async removeConnection(provider: unknown): Promise<ScheduleStateResponse> {
    return this.connections.removeConnection(provider)
  }

  /** Add one provider-agnostic ICS subscription (each subscription is its own source). */
  async addSubscription(input: ScheduleSubscriptionInput): Promise<ScheduleStateResponse> {
    return this.connections.addSubscription(input)
  }

  /** Remove one subscription plus its mirrored calendar/events; remote content is untouched. */
  async removeSubscription(sourceId: unknown): Promise<ScheduleStateResponse> {
    return this.connections.removeSubscription(sourceId)
  }

  /** Sync every enabled source; sources run sequentially so one slow line cannot starve the others. */
  async sync(): Promise<ScheduleSyncResponse> {
    return this.syncer.sync()
  }
}

/** Calendar lifecycle helpers kept on the store; declared here for the route layer's import list. */
export type { DeskCalendar }
