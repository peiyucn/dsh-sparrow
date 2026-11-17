

import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'


import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { TokenSpan } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import {
  COMPLETE_ROUTE_PATH, DOCK_SLOT_ID, LOCALE_NAMESPACE, MENU_SLOT_ID, PACKAGE_NAME, SLOT_INPUT_DOCK, SLOT_INPUT_LEFT,
  SLOT_INPUT_OVERLAY, SLOT_ORDER, SUPPORT_CHECK_TIMEOUT_MS, SWITCH_SLOT_ID, name,
} from '../constants.js'
import { warnMissingCapabilities } from '../compat.js'
import { clientCapabilities, type ClientCapabilityHost } from './capabilities.js'
import { ChatFimDock } from './ChatFimDock.js'
import { ChatFimMenu } from './ChatFimMenu.js'
import { ChatFimSwitch } from './ChatFimSwitch.js'
import type { FimDirectoryStore } from './contracts.js'
import { parseJsonOrNull } from './parse.js'
import { ensureChatFimStyles } from './styles.js'

export const inject = ['slots', 'sessions', 'locale']

export interface ChatFimResponse {
  readonly suggestions?: readonly string[]
  readonly model?: string
  readonly temperature?: number
  readonly usage?: { readonly promptTokens?: number; readonly completionTokens?: number }
  readonly error?: { readonly code?: string; readonly message?: string }
}


const LOCALE_DICTS = {
  zh: {
    'switch.label': 'FIM',
    'switch.onHint': '关闭输入框续写联想',
    'switch.offHint': '开启输入框续写联想',
    'dock.busy': '正在联想…',
    'dock.aria': '续写建议',
    'menu.adopt': '采用',
    'menu.dismiss': '丢弃',
    'menu.tokens': '{tokens} tok · {model} · T{temperature}',
    'sensitivity.hint': '联想敏锐度：{label}',
    'sensitivity.aria': '联想敏锐度：{label}',
    'sensitivity.eager': '高',
    'sensitivity.standard': '中',
    'sensitivity.conservative': '低',
    'sensitivity.eager.rule': '250ms · 4/2 字 · 半词/句末也联想',
    'sensitivity.standard.rule': '400ms · 8/6 字 · 半词/句末不联想',
    'sensitivity.conservative.rule': '800ms · 12/8 字 · 半词/空格不联想',
  },
  en: {
    'switch.label': 'FIM',
    'switch.onHint': 'Turn off input suggestions',
    'switch.offHint': 'Turn on input suggestions',
    'dock.busy': 'Suggesting…',
    'dock.aria': 'Suggestions',
    'menu.adopt': 'Adopt',
    'menu.dismiss': 'Dismiss',
    'menu.tokens': '{tokens} tok · {model} · T{temperature}',
    'sensitivity.hint': 'Sensitivity: {label}',
    'sensitivity.aria': 'Suggestion sensitivity: {label}',
    'sensitivity.eager': 'High',
    'sensitivity.standard': 'Medium',
    'sensitivity.conservative': 'Low',
    'sensitivity.eager.rule': '250ms · 4/2 chars · mid-word & sentence end',
    'sensitivity.standard.rule': '400ms · 8/6 chars · no half-words/sentence end',
    'sensitivity.conservative.rule': '800ms · 12/8 chars · no half-words/space',
  },
} as const


interface ClientSessionScope {
  scope(sessionId: SessionId): ClientAgentScope | undefined
}

interface ClientAgentScope extends Context {
  bail(subject: Context, event: string, payload: unknown): unknown
}


export function apply(ctx: Context): void {

  const c = ctx as unknown as ClientCapabilityHost & { logger?: { warn(message: string): void } }
  if (!warnMissingCapabilities(c, PACKAGE_NAME, clientCapabilities(c))) return
  const sessions = ctx.sessions as unknown as ClientSessionScope
  const styles = ensureChatFimStyles()
  ctx.effect(() => () => { styles.remove() }, `${name}: styles`)
  const disposeDictionaries = ctx.locale.register(LOCALE_NAMESPACE, { zh: LOCALE_DICTS.zh, en: LOCALE_DICTS.en })
  ctx.effect(() => disposeDictionaries, `${name}: locale dictionaries`)

  const injectedFace = (rawSessionId: string) => {


    const sessionId = rawSessionId as unknown as SessionId
    const scope = sessions.scope(sessionId)
    if (scope === undefined) {
      throw new Error(`dsh-chat-fim: session "${String(sessionId)}" 没有浏览器 scope`)
    }
    return {
      sessionId,


      directoryFor: (id: SessionId): FimDirectoryStore | undefined => {
        try {
          const resolver = ctx.root.get('modelDirectories') as unknown as {
            directoryFor(sessionId: SessionId): { store: FimDirectoryStore } | undefined
          } | undefined
          return resolver?.directoryFor(id)?.store
        } catch {
          return undefined
        }
      },

      checkSupport: async (id: SessionId): Promise<boolean | null> => {
        let response: Response
        try {
          response = await fetch(`${COMPLETE_ROUTE_PATH}?sessionId=${encodeURIComponent(String(id))}`, {
            signal: AbortSignal.timeout(SUPPORT_CHECK_TIMEOUT_MS),
          })
        } catch {
          return null
        }

        if (!response.ok) return null

        const payload = parseJsonOrNull(await response.text()) as { supported?: unknown } | null
        if (payload === null || typeof payload.supported !== 'boolean') return null
        return payload.supported
      },
      requestComplete: async (id: SessionId, prompt: string, signal: AbortSignal) => {
        const response = await fetch(COMPLETE_ROUTE_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },




          body: JSON.stringify({ sessionId: id, prompt }),
          signal,
        })
        const payload = parseJsonOrNull(await response.text()) as ChatFimResponse | null
        if (payload === null) {
          throw new Error(`续写响应不是合法 JSON（HTTP ${response.status}）`)
        }
        if (!response.ok) {
          throw new Error(payload.error?.message ?? `续写请求失败（HTTP ${response.status}）`)
        }
        return {
          suggestions: payload.suggestions ?? [],
          model: payload.model ?? '',
          temperature: payload.temperature ?? 0,
          usage: {
            promptTokens: payload.usage?.promptTokens ?? 0,
            completionTokens: payload.usage?.completionTokens ?? 0,
          },
        }
      },


      adopt: (_sessionId: SessionId, text: string, span: TokenSpan): boolean =>
        scope.bail(scope, 'slash/input-insert-text', { text, span }) === true,
    }
  }

  ctx.slots.inject(SLOT_INPUT_LEFT, () => ctx.slots.register({
    name: SLOT_INPUT_LEFT,
    id: SWITCH_SLOT_ID,
    order: SLOT_ORDER,
    locale: LOCALE_NAMESPACE,
    inject: injectedFace,
  }, ChatFimSwitch))

  ctx.slots.inject(SLOT_INPUT_DOCK, () => ctx.slots.register({
    name: SLOT_INPUT_DOCK,
    id: DOCK_SLOT_ID,
    order: SLOT_ORDER,
    locale: LOCALE_NAMESPACE,
    inject: injectedFace,
  }, ChatFimDock))

  ctx.slots.inject(SLOT_INPUT_OVERLAY, () => ctx.slots.register({
    name: SLOT_INPUT_OVERLAY,
    id: MENU_SLOT_ID,
    order: SLOT_ORDER,
    locale: LOCALE_NAMESPACE,
    inject: injectedFace,
  }, ChatFimMenu))
}

export { ChatFimDock } from './ChatFimDock.js'
export { ChatFimMenu } from './ChatFimMenu.js'
export { ChatFimSwitch } from './ChatFimSwitch.js'
export type { ChatFimDockInjected, ChatFimDockProps, ChatFimMenuProps, ChatFimSwitchProps, SuggestionRecord } from './contracts.js'
export { dispatchSupportEvent, readEnabled, setSuggestBusy, setSuggestEnabled, setSuggestError, setSuggestion, setTriggerSensitivity, useSuggestBusy, useSuggestEnabled, useSuggestError, useSuggestSupported, useSuggestSupportState, useSuggestion, useTriggerSensitivity } from './store.js'
export { fimSupportReducer, fimSupportShown, initialFimSupportState } from './fim-support-machine.js'
export type { FimSupportAddress, FimSupportEvent, FimSupportPhase, FimSupportState } from './fim-support-machine.js'
