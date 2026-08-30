/**
 * dsh-chat-fim client half：开关挂 `conversation.input.left`（输入框工具行），
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
import { ChatFimDock, ChatFimMenu, ChatFimSwitch, ensureFimBusyStyles } from './ChatFimDock.js'

export const inject = ['slots', 'sessions', 'locale']

export interface ChatFimResponse {
  readonly suggestions?: readonly string[]
  readonly model?: string
  readonly temperature?: number
  readonly usage?: { readonly promptTokens?: number; readonly completionTokens?: number }
  readonly error?: { readonly code?: string; readonly message?: string }
}

/** 客户端固定采用的停顿阈值；与 cordis.patch.yml 中 triggerPauseMs 保持一致。 */
const TRIGGER_PAUSE_MS = 400

/** 本插件的 locale 字典（未经 LocaleNamespaceMap 合并表，走非类型化注册）。 */
const LOCALE_DICTS = {
  zh: {
    'switch.label': '续写',
    'switch.onHint': '关闭输入框续写联想',
    'switch.offHint': '开启输入框续写联想',
    'dock.busy': '正在联想…',
    'dock.aria': '续写建议',
    'menu.adopt': '采用',
    'menu.dismiss': '丢弃',
    'menu.model.label': '续写模型：{mode}',
    'menu.model.auto': '自动',
    'menu.model.pro': 'Pro',
    'menu.model.flash': 'Flash',
    'menu.tokens': '{tokens} tok · {model} · T{temperature}',
  },
  en: {
    'switch.label': 'Suggest',
    'switch.onHint': 'Turn off input suggestions',
    'switch.offHint': 'Turn on input suggestions',
    'dock.busy': 'Suggesting…',
    'dock.aria': 'Suggestions',
    'menu.adopt': 'Adopt',
    'menu.dismiss': 'Dismiss',
    'menu.model.label': 'Model: {mode}',
    'menu.model.auto': 'Auto',
    'menu.model.pro': 'Pro',
    'menu.model.flash': 'Flash',
    'menu.tokens': '{tokens} tok · {model} · T{temperature}',
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
  ensureFimBusyStyles()
  const disposeDictionaries = ctx.locale.register('chat-fim', { zh: LOCALE_DICTS.zh, en: LOCALE_DICTS.en })
  ctx.effect(() => disposeDictionaries, 'dsh-chat-fim: locale dictionaries')

  /** 请求时读取当前语言：zh → zh，其余一律 en。 */
  const requestLanguage = (): 'zh' | 'en' => ctx.locale.getSnapshot().active === 'zh' ? 'zh' : 'en'

  const injectedFace = (sessionId: SessionId) => {
    const scope = sessions.scope(sessionId)
    if (scope === undefined) {
      throw new Error(`dsh-chat-fim: session "${String(sessionId)}" 没有浏览器 scope`)
    }
    return {
      isSupported: async (id: SessionId): Promise<boolean> => {
        const response = await fetch(`/api/chat-fim/complete?sessionId=${encodeURIComponent(String(id))}`)
        if (!response.ok) return true
        const payload = await response.json() as { supported?: boolean }
        return payload.supported !== false
      },
      requestComplete: async (id: SessionId, prompt: string, signal: AbortSignal, mode: 'auto' | 'pro' | 'flash') => {
        const response = await fetch('/api/chat-fim/complete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId: id, prompt, locale: requestLanguage(), fimModelMode: mode }),
          signal,
        })
        const payload = await response.json() as ChatFimResponse
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
    id: 'chat-fim-switch',
    order: 30,
    locale: 'chat-fim',
    inject: injectedFace,
  }, ChatFimSwitch))

  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'chat-fim',
    order: 30,
    locale: 'chat-fim',
    inject: injectedFace,
  }, ChatFimDock))

  ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
    name: 'conversation.input.overlay',
    id: 'chat-fim-menu',
    order: 30,
    locale: 'chat-fim',
    inject: injectedFace,
  }, ChatFimMenu))
}

export { ChatFimDock, ChatFimMenu, ChatFimSwitch, ensureFimBusyStyles } from './ChatFimDock.js'
export type { ChatFimDockInjected, ChatFimDockProps, ChatFimMenuProps, ChatFimSwitchProps, FimSuggestionRecord } from './ChatFimDock.js'
export { readEnabled, setFimBusy, setFimEnabled, setFimError, setFimSuggestion, setFimSupported, useFimBusy, useFimEnabled, useFimError, useFimSuggestion, useFimSupported } from './ChatFimDock.js'
export { TRIGGER_PAUSE_MS }
