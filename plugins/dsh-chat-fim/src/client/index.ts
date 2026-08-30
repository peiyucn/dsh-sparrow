/**
 * dsh-chat-fim client half：注册到 `conversation.composer.dock`（composer 卡片下方、
 * 与输入框同宽，同槽还有官方统计行；input.dock 在卡片上方左对齐、单飞突兀），
 * 建议请求全部走 host 自有路由。不 import Node 模块；API key 不进浏览器。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TokenSpan } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { ChatFimDock } from './ChatFimDock.js'

export const inject = ['slots', 'sessions']

export interface ChatFimResponse {
  readonly suggestions?: readonly string[]
  readonly error?: { readonly code?: string; readonly message?: string }
}

/** 客户端固定采用的停顿阈值；与 cordis.patch.yml 中 triggerPauseMs 保持一致。 */
const TRIGGER_PAUSE_MS = 400

/** 同一 TS 程序里 host/client 的 Context.sessions 声明会冲突，这里只取客户端需要的最小面。 */
interface ClientSessionScope {
  scope(sessionId: SessionId): ClientAgentScope | undefined
}

interface ClientAgentScope extends Context {
  bail(subject: Context, event: string, payload: unknown): unknown
}

/**
 * client half 入口：把 dock 槽位注册进 ui-conversation 声明的插槽。
 * @param ctx - 浏览器侧 Cordis 上下文。
 */
export function apply(ctx: ClientContext): void {
  const sessions = ctx.sessions as unknown as ClientSessionScope
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'chat-fim',
    order: 30,
    inject: (sessionId: SessionId) => {
      const scope = sessions.scope(sessionId)
      if (scope === undefined) {
        throw new Error(`dsh-chat-fim: session "${String(sessionId)}" 没有浏览器 scope`)
      }
      return {
        requestComplete: async (id: SessionId, prompt: string, signal: AbortSignal) => {
          const response = await fetch('/api/chat-fim/complete', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: id, prompt }),
            signal,
          })
          const payload = await response.json() as ChatFimResponse
          if (!response.ok) {
            throw new Error(payload.error?.message ?? `对话前缀续写请求失败（HTTP ${response.status}）`)
          }
          return payload.suggestions ?? []
        },
        adopt: (id: SessionId, text: string, span: TokenSpan): boolean =>
          scope.bail(scope, 'slash/input-insert-text', { text, span }) === true,
      }
    },
  }, ChatFimDock))
}

export { ChatFimDock } from './ChatFimDock.js'
export type { ChatFimDockInjected, ChatFimDockProps } from './ChatFimDock.js'
export { TRIGGER_PAUSE_MS }
