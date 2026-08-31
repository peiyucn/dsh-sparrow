/**
 * dsh-vision-access client half：模型选择器旁的状态图标（当前会话可跨模型读图时点亮）。
 * 纯指示、无交互、无持久状态；可用性判定全在 host（GET /api/vision-access/status）。
 */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { VisionStatusIcon } from './VisionStatusIcon.js'

export const inject = ['slots', 'locale']

/** 本插件的 locale 字典（zh/en）。 */
const LOCALE_DICTS = {
  zh: {
    'icon.hint': '当前模型不支持看图：贴图后直接询问，自动经视觉模型读图',
  },
  en: {
    'icon.hint': 'This model cannot see images: paste one and ask — it is read by the vision model automatically',
  },
} as const

/**
 * client half 入口：注册 locale 字典 + 状态图标槽位。
 * @param ctx - 浏览器侧 Cordis 上下文。
 */
export function apply(ctx: ClientContext): void {
  const disposeDictionaries = ctx.locale.register('vision-access', { zh: LOCALE_DICTS.zh, en: LOCALE_DICTS.en })
  ctx.effect(() => disposeDictionaries, 'dsh-vision-access: locale dictionaries')

  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'vision-access-status',
    order: 20,
    locale: 'vision-access',
    inject: () => ({
      isAvailable: async (id: SessionId): Promise<boolean> => {
        const response = await fetch(`/api/vision-access/status?sessionId=${encodeURIComponent(String(id))}`)
        if (!response.ok) return false
        const payload = await response.json() as { available?: boolean }
        return payload.available === true
      },
    }),
  }, VisionStatusIcon))
}

export { VisionStatusIcon } from './VisionStatusIcon.js'
export type { VisionStatusInjected, VisionStatusProps } from './VisionStatusIcon.js'
