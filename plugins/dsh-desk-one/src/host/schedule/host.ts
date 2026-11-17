

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


  async startOutlookLogin(redirectUri?: string): Promise<OutlookLoginStartResponse> {
    return this.oauth.startOutlookLogin(redirectUri)
  }

  async pollOutlookLogin(flowId: unknown): Promise<OutlookLoginPollResponse> {
    return this.oauth.pollOutlookLogin(flowId)
  }


  async completeOutlookLogin(code: unknown, state: unknown): Promise<{ ok: boolean; message: string }> {
    return this.oauth.completeOutlookLogin(code, state)
  }

  async disconnectOutlookGraph(): Promise<ScheduleStateResponse> {
    return this.connections.disconnectOutlookGraph()
  }


  state(): ScheduleStateResponse {
    const counts = this.store.countEventsByCalendar()
    const calendars = this.store.listCalendars()
    return {
      sources: this.store.listScheduleSources(),
      calendars,
      counts: Object.fromEntries([...counts.entries()]),
    }
  }


  events(from: string, to: string, calendarIds?: readonly string[], provider?: ScheduleProvider): ScheduleEventListResponse {
    if (!Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || from >= to) {
      throw new DeskError('INVALID_SCHEDULE', '时间区间不合法', 400)
    }
    const events = this.store.listEvents({ from, to, calendarIds, provider })
    return { events, from, to }
  }


  async test(input: ScheduleConnectionInput): Promise<ScheduleConnectionTestResponse> {
    return this.connections.test(input)
  }


  async saveConnection(input: ScheduleConnectionInput): Promise<ScheduleStateResponse> {
    return this.connections.saveConnection(input)
  }


  async removeConnection(provider: unknown): Promise<ScheduleStateResponse> {
    return this.connections.removeConnection(provider)
  }


  async addSubscription(input: ScheduleSubscriptionInput): Promise<ScheduleStateResponse> {
    return this.connections.addSubscription(input)
  }


  async removeSubscription(sourceId: unknown): Promise<ScheduleStateResponse> {
    return this.connections.removeSubscription(sourceId)
  }


  async sync(): Promise<ScheduleSyncResponse> {
    return this.syncer.sync()
  }
}


export type { DeskCalendar }
