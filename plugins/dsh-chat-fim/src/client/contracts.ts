

import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TokenSpan } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'

export interface SuggestCompleteResult {
  readonly suggestions: readonly string[]
  readonly model: string
  readonly temperature: number
  readonly usage: { readonly promptTokens: number; readonly completionTokens: number }
}


export interface FimDirectoryStore {
  getSnapshot(): { current: { provider: string; model: string } | null }
  subscribe(listener: () => void): () => void
}

export interface ChatFimDockInjected {

  readonly sessionId: SessionId

  readonly directoryFor: (sessionId: SessionId) => FimDirectoryStore | undefined

  checkSupport: (sessionId: SessionId) => Promise<boolean | null>

  requestComplete: (
    sessionId: SessionId,
    prompt: string,
    signal: AbortSignal,
  ) => Promise<SuggestCompleteResult>

  adopt: (sessionId: SessionId, text: string, span: TokenSpan) => boolean
}

export type ChatFimDockProps = PropsRuntime<'conversation.input.dock'> & ChatFimDockInjected & {
  t: TranslateNS<'chat-fim'>

  useProjection?: (key: string) => unknown
}
export type ChatFimSwitchProps = PropsRuntime<'conversation.input.left'> & ChatFimDockInjected & { t: TranslateNS<'chat-fim'> }
export type ChatFimMenuProps = PropsRuntime<'conversation.input.overlay'> & ChatFimDockInjected & { t: TranslateNS<'chat-fim'> }


export interface SuggestionRecord {
  readonly text: string
  readonly sessionId: SessionId
  readonly draft: string
  readonly draftRev: number

  readonly detectEnd: number

  readonly model: string

  readonly totalTokens: number

  readonly temperature: number
}
