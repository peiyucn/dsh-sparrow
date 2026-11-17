

import type { SessionId } from '@deepseek-ai/dsh-session'

declare module '@deepseek-ai/cordis' {
  interface Events {

    'api-session/removed'(sessionId: SessionId): void

    'api-session/added'(summary: {
      sessionId: SessionId
      updatedAt: number
      running: boolean
      blank: boolean
      parentSessionId?: SessionId
      origin?: 'subagent'
      cwd?: string
      agentAvailable: boolean
      projections?: {
        kind: 'cached'
        asOfSeq: number
        values: Readonly<Record<string, unknown>>
      }
    }): void
  }
}
