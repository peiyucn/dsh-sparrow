/**
 * dsh-chat-suggest client half：开关挂 `conversation.input.left`（输入框工具行），
 * 数据面挂 `conversation.composer.dock`（读 InputZone 草稿快照、无可见 UI），
 * 候选菜单挂 `conversation.input.overlay`（官方 @ 列表同款悬浮卡），
 * 建议请求全部走 host 自有路由。文案经 dsh locale 服务（zh/en）。
 * 不 import Node 模块；API key 不进浏览器。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { TokenSpan } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { ChatSuggestDock, ChatSuggestMenu, ChatSuggestSwitch, ensureSuggestBusyStyles } from './ChatSuggestDock.js'

export const inject = ['slots', 'sessions', 'locale']

export interface ChatSuggestResponse {
  readonly suggestions?: readonly string[]
  readonly model?: string
  readonly temperature?: number
  readonly usage?: { readonly promptTokens?: number; readonly completionTokens?: number }
  readonly error?: { readonly code?: string; readonly message?: string }
}

/** 本插件的 locale 字典（经 locale.d.ts 的 LocaleNamespaceMap 扩充做类型化注册）。 */
const LOCALE_DICTS = {
  zh: {
    'switch.label': '续写',
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
    'sensitivity.eager.rule': '250ms · 6/4 字 · 半词/句末也联想',
    'sensitivity.standard.rule': '400ms · 10/6 字 · 半词/句末不联想',
    'sensitivity.conservative.rule': '800ms · 14/10 字 · 半词/空格不联想',
  },
  en: {
    'switch.label': 'Suggest',
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
    'sensitivity.eager.rule': '250ms · 6/4 chars · mid-word & sentence end',
    'sensitivity.standard.rule': '400ms · 10/6 chars · no half-words/sentence end',
    'sensitivity.conservative.rule': '800ms · 14/10 chars · no half-words/space',
  },
} as const

/** 同一 TS 程序里 host/client 的 Context.sessions 声明会冲突，这里只取客户端需要的最小面。 */
interface ClientSessionScope {
  scope(sessionId: SessionId): ClientAgentScope | undefined
}

interface ClientAgentScope extends Context {
  bail(subject: Context, event: string, payload: unknown): unknown
}

/**
 * client half 入口：注册 locale 字典 + 两个槽位（开关 / 建议条）。
 * @param ctx - 浏览器侧 Cordis 上下文。
 */
export function apply(ctx: ClientContext): void {
  const sessions = ctx.sessions as unknown as ClientSessionScope
  const busyStyles = ensureSuggestBusyStyles()
  ctx.effect(() => () => { busyStyles.remove() }, 'dsh-chat-suggest: busy styles')
  const disposeDictionaries = ctx.locale.register('chat-suggest', { zh: LOCALE_DICTS.zh, en: LOCALE_DICTS.en })
  ctx.effect(() => disposeDictionaries, 'dsh-chat-suggest: locale dictionaries')

  const injectedFace = (sessionId: SessionId) => {
    const scope = sessions.scope(sessionId)
    if (scope === undefined) {
      throw new Error(`dsh-chat-suggest: session "${String(sessionId)}" 没有浏览器 scope`)
    }
    return {
      sessionId,
      isSupported: async (id: SessionId): Promise<boolean> => {
        const response = await fetch(`/api/chat-suggest/complete?sessionId=${encodeURIComponent(String(id))}`)
        if (!response.ok) return true
        const payload = await response.json() as { supported?: boolean }
        return payload.supported !== false
      },
      requestComplete: async (id: SessionId, prompt: string, signal: AbortSignal) => {
        const response = await fetch('/api/chat-suggest/complete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          // 续写模型固定 flash（足够快且便宜）：不再提供模型三档选择。
          // 语言由 host 按草稿内容自适应（detectDraftLanguage），客户端不再传 locale。
          body: JSON.stringify({ sessionId: id, prompt, suggestModelMode: 'flash' }),
          signal,
        })
        const payload = await response.json() as ChatSuggestResponse
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
      adopt: (id: SessionId, text: string, span: TokenSpan): boolean =>
        scope.bail(scope, 'slash/input-insert-text', { text, span }) === true,
    }
  }

  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'chat-suggest-switch',
    order: 30,
    locale: 'chat-suggest',
    inject: injectedFace,
  }, ChatSuggestSwitch))

  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'chat-suggest',
    order: 30,
    locale: 'chat-suggest',
    inject: injectedFace,
  }, ChatSuggestDock))

  ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
    name: 'conversation.input.overlay',
    id: 'chat-suggest-menu',
    order: 30,
    locale: 'chat-suggest',
    inject: injectedFace,
  }, ChatSuggestMenu))
}

export { ChatSuggestDock, ChatSuggestMenu, ChatSuggestSwitch, ensureSuggestBusyStyles } from './ChatSuggestDock.js'
export type { ChatSuggestDockInjected, ChatSuggestDockProps, ChatSuggestMenuProps, ChatSuggestSwitchProps, SuggestionRecord } from './ChatSuggestDock.js'
export { readEnabled, readTriggerSensitivity, setSuggestBusy, setSuggestEnabled, setSuggestError, setTriggerSensitivity, setSuggestion, setSuggestSupported, useSuggestBusy, useSuggestEnabled, useSuggestError, useTriggerSensitivity, useSuggestion, useSuggestSupported } from './ChatSuggestDock.js'
