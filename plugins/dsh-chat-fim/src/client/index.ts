/**
 * dsh-chat-fim client half：开关挂 `conversation.input.left`（输入框工具行），
 * 建议条挂 `conversation.composer.dock`（卡片下方、与输入框同宽），
 * 建议请求全部走 host 自有路由。文案经 dsh locale 服务（zh/en）。
 * 不 import Node 模块；API key 不进浏览器。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { TokenSpan } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { ChatFimDock, ChatFimSwitch } from './ChatFimDock.js'

export const inject = ['slots', 'sessions', 'locale']

export interface ChatFimResponse {
  readonly suggestions?: readonly string[]
  readonly error?: { readonly code?: string; readonly message?: string }
}

/** 客户端固定采用的停顿阈值；与 cordis.patch.yml 中 triggerPauseMs 保持一致。 */
const TRIGGER_PAUSE_MS = 400

/** 本插件的 locale 字典（未经 LocaleNamespaceMap 合并表，走非类型化注册）。 */
const LOCALE_DICTS = {
  zh: {
    'switch.label': '续写',
    'switch.on': '开',
    'switch.off': '关',
    'switch.onHint': '关闭输入框续写联想',
    'switch.offHint': '开启输入框续写联想',
    'dock.busy': '正在联想…',
    'dock.aria': '续写建议',
  },
  en: {
    'switch.label': 'Suggest',
    'switch.on': 'On',
    'switch.off': 'Off',
    'switch.onHint': 'Turn off input suggestions',
    'switch.offHint': 'Turn on input suggestions',
    'dock.busy': 'Suggesting…',
    'dock.aria': 'Suggestions',
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
      requestComplete: async (id: SessionId, prompt: string, signal: AbortSignal) => {
        const response = await fetch('/api/chat-fim/complete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId: id, prompt, locale: requestLanguage() }),
          signal,
        })
        const payload = await response.json() as ChatFimResponse
        if (!response.ok) {
          throw new Error(payload.error?.message ?? `续写请求失败（HTTP ${response.status}）`)
        }
        return payload.suggestions ?? []
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
}

export { ChatFimDock, ChatFimSwitch } from './ChatFimDock.js'
export type { ChatFimDockInjected, ChatFimDockProps, ChatFimSwitchProps } from './ChatFimDock.js'
export { readEnabled, setFimEnabled, useFimEnabled } from './ChatFimDock.js'
export { TRIGGER_PAUSE_MS }
