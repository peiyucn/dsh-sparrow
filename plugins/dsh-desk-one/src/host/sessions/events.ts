/** Types for the official session-controller public events (emitted by this plugin; handled at runtime by the host event bus). */

import type { SessionId } from '@deepseek-ai/dsh-session'

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Official session-controller public event (@mode emit, see dsh-api-session-controller types.ts):
     * the client session list removes entries immediately from it when a session leaves the host. After a
     * move to trash / delete succeeds the session directory is already gone, so re-emitting this event lets
     * the sidebar's "Ungrouped" and other lists sync immediately (2026-08-30 fix for stale entries).
     */
    'api-session/removed'(sessionId: SessionId): void
    /**
     * Official public event: a session returns to the list (payload shape mirrors the plugin-usable subset of
     * the official SessionSummary, see dsh-api-session-controller types.ts). `projections` is the official
     * cached projection block: the client's `handleSessionAdded` applies it via applyCached, so the session
     * list shows titles / child-session labels without a refresh.
     */
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
