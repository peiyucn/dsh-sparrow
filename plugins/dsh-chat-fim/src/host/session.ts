

import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { EpochHeader, Session } from '@deepseek-ai/dsh-session'
import { unsupportedStoredFormatReason } from '../compat.js'
import { currentMainRoute, mainRouteFromHeader } from '../upstream.js'


export function findHostSession(ctx: Context, sessionId: SessionId): Session | undefined {
  return ctx.sessions.get(sessionId)
}


export function hostFormatSupported(header: { readonly version?: unknown } | undefined): boolean {
  return header !== undefined && unsupportedStoredFormatReason([header]) === undefined
}


export function sessionSurfaceSupported(session: unknown): boolean {
  const candidate = session as { requestHeader?: unknown; deriveMessages?: unknown } | null | undefined
  return typeof candidate?.requestHeader === 'function' && typeof candidate.deriveMessages === 'function'
}


export function currentSessionModel(
  ctx: Context,
  session: { requestHeader(): EpochHeader | undefined },
): { provider: string; model: string } | undefined {
  let selection: { lastUsed?: { provider: string; model: string } | null; pending?: { provider: string; model: string } | null } | undefined
  try {
    const projections = ctx.get('sessionProjections') as unknown as {
      stateOf(session: unknown, key: string): { lastUsed?: { provider: string; model: string } | null; pending?: { provider: string; model: string } | null } | undefined
    } | undefined
    selection = projections?.stateOf(session, 'modelSelection')
  } catch {

  }
  let defaultModel: { provider: string; model: string } | undefined
  try {
    const service = ctx.get('agentDefaultModel') as {
      currentSelection?: () => { provider: string; model: string } | undefined
    } | undefined
    const selected = service?.currentSelection?.()
    if (selected !== undefined && typeof selected.provider === 'string' && typeof selected.model === 'string') {
      defaultModel = { provider: selected.provider, model: selected.model }
    }
  } catch {

  }
  return currentMainRoute(selection, mainRouteFromHeader(session.requestHeader()), defaultModel)
}
