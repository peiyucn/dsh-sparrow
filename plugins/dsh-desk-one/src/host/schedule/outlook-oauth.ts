/**
 * Outlook OAuth for the schedule source: two login shapes (browser redirect with PKCE, device-code
 * fallback), the in-memory flow registry those logins use, and the short-lived Graph access-token
 * cache. Only the refresh token is persisted (through the credentials seam); everything else is
 * process memory and dies with the host.
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { OUTLOOK_GRAPH_REFRESH_REF } from '../../constants.js'
import type {
  DeskScheduleSource, OutlookLoginPollResponse, OutlookLoginStartResponse, ScheduleStateResponse,
  ScheduleSyncSourceReport,
} from '../../contract.js'
import { DeskError } from '../http.js'
import type { DeskStore } from '../store.js'
import {
  codeChallenge, exchangeGraphCode, graphAuthorizeUrl, pollGraphDeviceCode, refreshGraphToken, startGraphDeviceCode,
} from './providers/graph.js'
import { adapterDeps, requireCredentials, resolveSecret, text } from './connections.js'
import { ScheduleError } from './types.js'

type OutlookFlow =
  | { kind: 'device'; deviceCode: string; expiresAt: number }
  | {
      kind: 'redirect'
      verifier: string
      state: string
      redirectUri: string
      expiresAt: number
      completed?: ScheduleStateResponse
    }

/** Facade seams the OAuth module cannot import directly without a cycle. */
export interface OutlookOAuthDeps {
  /** Pull one source directly (login warm-up; deliberately bypasses the shared single-flight slot). */
  readonly syncSource: (source: DeskScheduleSource) => Promise<ScheduleSyncSourceReport>
  /** Current schedule page state, returned after a successful login / disconnect. */
  readonly state: () => ScheduleStateResponse
}

export class OutlookOAuth {
  private readonly outlookFlows = new Map<string, OutlookFlow>()
  private readonly graphAccess = new Map<string, { token: string; expiresAt: number }>()

  constructor(private readonly ctx: Context, private readonly store: DeskStore, private readonly deps: OutlookOAuthDeps) {}

  /** Browser redirect login (default) or device code (fallback). */
  async startOutlookLogin(redirectUri?: string): Promise<OutlookLoginStartResponse> {
    if (redirectUri !== undefined && redirectUri !== '') {
      const parsed = new URL(redirectUri)
      if (parsed.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(parsed.hostname)
        || !parsed.pathname.endsWith('/api/desk-one/schedule/outlook/callback')) {
        throw new DeskError('INVALID_SCHEDULE', '登录回调地址必须是本机 desk-one 的 callback 路由', 400)
      }
      const verifier = randomUUID() + randomUUID()
      const state = randomUUID()
      const flowId = randomUUID()
      this.outlookFlows.set(flowId, {
        kind: 'redirect',
        verifier,
        state,
        redirectUri,
        expiresAt: Date.now() + 10 * 60_000,
      })
      return {
        flowId,
        kind: 'redirect',
        authUrl: graphAuthorizeUrl({ redirectUri, state, challenge: await codeChallenge(verifier) }),
        userCode: '',
        verificationUri: '',
        expiresIn: 600,
        interval: 2,
      }
    }
    const code = await startGraphDeviceCode(adapterDeps())
    const flowId = randomUUID()
    this.outlookFlows.set(flowId, { kind: 'device', deviceCode: code.deviceCode, expiresAt: Date.now() + code.expiresIn * 1000 })
    return {
      flowId,
      kind: 'device',
      userCode: code.userCode,
      verificationUri: code.verificationUri,
      expiresIn: code.expiresIn,
      interval: code.interval,
    }
  }

  async pollOutlookLogin(flowId: unknown): Promise<OutlookLoginPollResponse> {
    const id = text(flowId)
    const flow = this.outlookFlows.get(id)
    if (flow === undefined || flow.expiresAt <= Date.now()) {
      this.outlookFlows.delete(id)
      throw new DeskError('SCHEDULE_AUTH_EXPIRED', '登录已过期，请重新发起', 409)
    }
    if (flow.kind === 'redirect') {
      return flow.completed === undefined
        ? { status: 'pending' }
        : { status: 'connected', state: flow.completed }
    }
    let tokens
    try {
      tokens = await pollGraphDeviceCode(flow.deviceCode, adapterDeps())
    } catch (error) {
      // A pending device code is a normal poll result, not a page-level error.
      if (error instanceof ScheduleError && error.kind === 'TRANSIENT') {
        return { status: 'pending', message: error.message }
      }
      throw error
    }
    if (tokens === null || tokens.refreshToken === undefined) return { status: 'pending' }
    this.outlookFlows.delete(id)
    return this.finishOutlookLogin(tokens.refreshToken)
  }

  /** OAuth redirect callback: exchange the code, persist the refresh token, warm one sync. */
  async completeOutlookLogin(code: unknown, state: unknown): Promise<{ ok: boolean; message: string }> {
    const value = text(code)
    const stateId = text(state)
    const entry = [...this.outlookFlows.entries()].find(([, flow]) => flow.kind === 'redirect' && flow.state === stateId)
    if (entry === undefined) return { ok: false, message: '登录状态已过期，请回到 Desk One 重新点击登录。' }
    const [, flow] = entry
    if (flow.kind !== 'redirect') return { ok: false, message: '登录状态无效。' }
    try {
      const tokens = await exchangeGraphCode({ code: value, redirectUri: flow.redirectUri, verifier: flow.verifier }, adapterDeps())
      if (tokens.refreshToken === undefined) return { ok: false, message: 'Microsoft 没有返回 refresh token，请重试。' }
      const result = await this.finishOutlookLogin(tokens.refreshToken)
      flow.completed = result.state
      return { ok: true, message: 'Outlook 已连接，请回到 Desk One 关闭本窗口。' }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  private async finishOutlookLogin(refreshToken: string): Promise<OutlookLoginPollResponse> {
    const service = requireCredentials(this.ctx)
    await service.set(OUTLOOK_GRAPH_REFRESH_REF, refreshToken)
    const source = await this.store.upsertScheduleSource({
      provider: 'outlook',
      channel: 'graph',
      account: 'Outlook 个人账户',
      credentialRef: OUTLOOK_GRAPH_REFRESH_REF,
    })
    await this.deps.syncSource(source).catch(() => undefined)
    return { status: 'connected', state: this.deps.state() }
  }

  /** Drop every cached Graph access token (the disconnect path). */
  clearGraphAccess(): void {
    this.graphAccess.clear()
  }

  /** Valid Graph access token for one source, refreshing (and persisting) when expired. */
  async graphToken(source: DeskScheduleSource): Promise<string> {
    const cached = this.graphAccess.get(source.id)
    if (cached !== undefined && cached.expiresAt > Date.now() + 60_000) return cached.token
    const refreshToken = await resolveSecret(this.ctx, source.credentialRef ?? OUTLOOK_GRAPH_REFRESH_REF)
    const tokens = await refreshGraphToken(refreshToken, adapterDeps())
    this.graphAccess.set(source.id, { token: tokens.accessToken, expiresAt: Date.now() + tokens.expiresIn * 1000 })
    if (tokens.refreshToken !== undefined) {
      const service = requireCredentials(this.ctx)
      await service.set(OUTLOOK_GRAPH_REFRESH_REF, tokens.refreshToken).catch(() => undefined)
    }
    return tokens.accessToken
  }
}
