/**
 * 会话积分账本接线：live 走官方投影状态（逐事件驱动，读 O(1)），冷会话走
 * `sessionController.inspect()` + 一次性重放；两条路径统一归约为 `CreditsView`。
 *
 * 投影走 `ctx.inject(['sessionProjections'], …)` 可选注册：服务缺席时积分降级为「仅冷路径」，
 * provider 照常工作——积分是展示面，不该因它停掉推理。
 */

import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { CREDIT_PROJECTION_KEY } from '../constants.js'
import { codebuddyCreditsProjectionDefinition, viewOfCreditsState } from '../credits-projection.js'
import type { CreditsProjectionState } from '../credits-projection.js'
import { createLedgerResolver } from '../credits-source.js'
import type { TurnUsageView } from '../web.js'

/** 无账本时的空视图（会话不存在 / 冷读失败且无缓存）。 */
const EMPTY_USAGE: TurnUsageView = { credit: 0, calls: 0, byModel: [] }

export interface CreditLedgerService {
  /** 会话累计积分：live 走官方投影状态，冷会话走持久化重放（重启后仍准确）。 */
  sessionUsage(sessionId: string): Promise<TurnUsageView>
  /** 单轮积分：按事件里的 turn 取用（每轮积分胶囊用）。 */
  turnUsage(sessionId: string, turn: number): Promise<TurnUsageView>
}

export function createCreditLedger(ctx: Context): CreditLedgerService {
  const ledgers = createLedgerResolver({
    live: (sessionId) => {
      // 软获取：服务缺失即降级（用 `ctx.get`——未 inject 时 `ctx.sessionProjections` 会抛）。
      const registry = ctx.get('sessionProjections') as
        | { stateOf(session: unknown, key: string): unknown }
        | undefined
      if (registry === undefined) return undefined
      const session = ctx.sessions.get(SessionId(sessionId))
      if (session === undefined) return undefined
      const state = registry.stateOf(session, CREDIT_PROJECTION_KEY)
      // 未注册（或状态类型不认识）时降级：交给冷路径。
      if (state === undefined || state === null || typeof state !== 'object') return undefined
      return viewOfCreditsState(state as CreditsProjectionState)
    },
    inspect: async (sessionId) => {
      // sessionController 只随 web-app bundle 加载，故软获取；缺失即降级为「仅 live 会话准确」。
      const controller = ctx.get('sessionController') as
        | { inspect(id: unknown): Promise<{ events: readonly SessionEvent[] }> }
        | undefined
      if (controller === undefined) return undefined
      return (await controller.inspect(SessionId(sessionId))).events
    },
  })

  // 投影单元注册：可选依赖 fork——服务出现才注册（fork 是 entry 的子 fiber，不进 boot audit 的
  // entry 列表）；注册随 fiber 释放，disposer 由 effect 托管。
  ctx.inject(['sessionProjections'], (projectionCtx) => {
    projectionCtx.sessionProjections.register(codebuddyCreditsProjectionDefinition)
  })

  return {
    async sessionUsage(sessionId) {
      const view = await ledgers.for(sessionId)
      return view === undefined ? EMPTY_USAGE : view.session()
    },
    async turnUsage(sessionId, turn) {
      const view = await ledgers.for(sessionId)
      return view === undefined ? EMPTY_USAGE : view.turn(turn)
    },
  }
}
