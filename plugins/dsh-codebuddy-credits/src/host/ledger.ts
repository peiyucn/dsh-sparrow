/**
 * 会话积分账本接线：live 走官方投影状态（逐事件驱动，读 O(1)），冷会话走官方持久化
 * `ctx.sessionPersistence.open(id, 'read')` + 一次性重放；两条路径统一归约为 `CreditsView`。
 *
 * 投影走 `ctx.inject(['sessionProjections'], …)` 可选注册：服务缺席时积分降级为「仅冷路径」，
 * provider 照常工作——积分是展示面，不该因它停掉推理。
 *
 * dsh 0.2.2 适配：`sessionProjections.register()` 变异步并返回 `ProjectionHandle`（live 读用它
 * 的 `stateOf`，注册随 fiber 释放）；旧的 `sessionController.inspect()` 已删除，冷路径改为官方
 * 公开的持久化读面 `ctx.sessionPersistence.open(id, 'read')`。
 */

import type { Context } from '@deepseek-ai/cordis'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { ProjectionHandle } from '@deepseek-ai/dsh-session-projection'
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

/** 官方 `SessionHandle` 的最小读面：只声明本插件实际用到的两个方法，宿主契约漂移时退化为降级。 */
interface PersistenceReader {
  read(): Promise<{ events: readonly SessionEvent[] }>
  close(): Promise<void>
}

interface PersistenceLike {
  open(id: SessionId, access: 'read'): Promise<PersistenceReader>
}

export function createCreditLedger(ctx: Context): CreditLedgerService {
  // dsh 0.2.2 起 `register()` 异步返回句柄；live 读用句柄的 `stateOf`，句柄随注册 effect 释放。
  let projection: ProjectionHandle<CreditsProjectionState> | undefined

  const ledgers = createLedgerResolver({
    live: (sessionId) => {
      if (projection === undefined) return undefined
      const session = ctx.sessions.get(SessionId(sessionId))
      if (session === undefined) return undefined
      try {
        const state = projection.stateOf(session)
        // 未注册（或状态类型不认识）时降级：交给冷路径。
        if (state === undefined || state === null || typeof state !== 'object') return undefined
        return viewOfCreditsState(state as CreditsProjectionState)
      } catch {
        return undefined
      }
    },
    inspect: async (sessionId) => {
      // 已接入会话由 live 投影负责（投影状态是官方推荐读面），这里只处理冷会话；
      // 冷会话读官方持久化公开读面，不再依赖已删除的 web-app sessionController.inspect()。
      if (ctx.sessions.get(SessionId(sessionId)) !== undefined) return undefined
      const persistence = ctx.get('sessionPersistence') as unknown as PersistenceLike | undefined
      if (persistence === undefined) return undefined
      const handle = await persistence.open(SessionId(sessionId), 'read')
      try {
        return (await handle.read()).events
      } finally {
        await handle.close()
      }
    },
  })

  // 投影单元注册：可选依赖 fork——服务出现才注册（fork 是 entry 的子 fiber，不进 boot audit 的
  // entry 列表）；注册随 fiber 释放。`register()` 返回的 thenable 同时是官方兼容用的 effect disposer。
  ctx.inject(['sessionProjections'], (projectionCtx) => {
    const registration = projectionCtx.sessionProjections.register(codebuddyCreditsProjectionDefinition)
    projectionCtx.effect(() => registration as unknown as () => void, 'codebuddy-credits: credits projection')
    void registration
      .then((handle) => { projection = handle })
      .catch((error: unknown) => {
        projectionCtx.logger.warn('codebuddy-credits: 积分投影注册失败；积分显示为 0（推理不受影响）')
        projectionCtx.logger.warn(error)
      })
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
