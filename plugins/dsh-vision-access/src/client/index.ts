/**
 * dsh-vision-access client half：模型选择器旁的状态图标（非视觉模型才显示，点击弹说明）。
 * 无持久状态；可用性判定与视觉模型 id 全在 host（GET /api/vision-access/status）。
 */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { ensureVisionStyles, VisionStatusIcon } from './VisionStatusIcon.js'

export const inject = ['slots', 'locale']

/** 本插件的 locale 字典（zh/en）。 */
const LOCALE_DICTS = {
  zh: {
    'popover.title': '可跨模型读图',
    'popover.body': '直接发送图片即可：dsh-vision-access 会自动把图片交给 {model} 处理，主模型保持对话大脑。',
  },
  en: {
    'popover.title': 'Cross-model image reading',
    'popover.body': 'Just send an image: dsh-vision-access sends it to {model} automatically, while the main model stays the brain of the conversation.',
  },
} as const

/**
 * client half 入口：注册 locale 字典 + 状态图标槽位。
 * @param ctx - 浏览器侧 Cordis 上下文。
 */
export function apply(ctx: ClientContext): void {
  const styles = ensureVisionStyles()
  ctx.effect(() => () => { styles.remove() }, 'dsh-vision-access: styles')
  const disposeDictionaries = ctx.locale.register('vision-access', { zh: LOCALE_DICTS.zh, en: LOCALE_DICTS.en })
  ctx.effect(() => disposeDictionaries, 'dsh-vision-access: locale dictionaries')

  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'vision-access-status',
    order: 20,
    locale: 'vision-access',
    inject: () => ({
      queryStatus: async (id: SessionId): Promise<{ available: boolean; visionModel: string }> => {
        const response = await fetch(`/api/vision-access/status?sessionId=${encodeURIComponent(String(id))}`)
        if (!response.ok) return { available: false, visionModel: '' }
        const payload = await response.json() as { available?: boolean; visionModel?: string }
        return { available: payload.available === true, visionModel: payload.visionModel ?? '' }
      },
    }),
  }, VisionStatusIcon))
}

export { ensureVisionStyles, VisionStatusIcon } from './VisionStatusIcon.js'
export type { VisionStatusInjected, VisionStatusProps, VisionStatusResult } from './VisionStatusIcon.js'
