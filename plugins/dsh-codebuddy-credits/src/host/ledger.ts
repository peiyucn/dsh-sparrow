

import type { Context } from '@deepseek-ai/cordis'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { ProjectionHandle } from '@deepseek-ai/dsh-session-projection'
import { codebuddyCreditsProjectionDefinition, viewOfCreditsState } from '../credits-projection.js'
import type { CreditsProjectionState } from '../credits-projection.js'
import { createLedgerResolver } from '../credits-source.js'
import type { TurnUsageView } from '../web.js'


const EMPTY_USAGE: TurnUsageView = { credit: 0, calls: 0, byModel: [] }

export interface CreditLedgerService {

  sessionUsage(sessionId: string): Promise<TurnUsageView>

  turnUsage(sessionId: string, turn: number): Promise<TurnUsageView>
}


interface PersistenceReader {
  read(): Promise<{ events: readonly SessionEvent[] }>
  close(): Promise<void>
}

interface PersistenceLike {
  open(id: SessionId, access: 'read'): Promise<PersistenceReader>
}

export function createCreditLedger(ctx: Context): CreditLedgerService {

  let projection: ProjectionHandle<CreditsProjectionState> | undefined

  const ledgers = createLedgerResolver({
    live: (sessionId) => {
      if (projection === undefined) return undefined
      const session = ctx.sessions.get(SessionId(sessionId))
      if (session === undefined) return undefined
      try {
        const state = projection.stateOf(session)

        if (state === undefined || state === null || typeof state !== 'object') return undefined
        return viewOfCreditsState(state as CreditsProjectionState)
      } catch {
        return undefined
      }
    },
    inspect: async (sessionId) => {


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
