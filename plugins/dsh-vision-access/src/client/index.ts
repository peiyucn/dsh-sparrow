/**
 * dsh-vision-access client half：模型选择器旁的状态图标（非视觉模型才显示，点击弹说明）。
 * 无持久状态；可用性判定与视觉模型 id 全在 host（GET /api/vision-access/status）。
 */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { ensureVisionStyles, VisionStatusIcon, type VisionStatusResult } from './VisionStatusIcon.js'

export const inject = ['slots', 'locale']

/** 本插件的 locale 字典（zh/en）。 */
const LOCALE_DICTS = {
  zh: {
    'popover.crossModel.title': '可跨模型读图',
    'popover.crossModel.body': '直接发送图片即可：dsh-vision-access 会自动把图片交给 {model} 处理，主模型保持对话大脑。',
    'popover.nativeVision.title': '该模型原生支持视觉',
    'popover.nativeVision.body': '当前模型本身就支持看图：图片直达主模型，无需经视觉通道转述。',
    'popover.noVision.title': '该模型不支持看图',
    'popover.noVision.body': '当前模型不具备视觉能力，也不在此插件支持的跨模型读图范围内（仅 DeepSeek 文本模型）。请切换模型后再试。',
  },
  en: {
    'popover.crossModel.title': 'Cross-model image reading',
    'popover.crossModel.body': 'Just send an image: dsh-vision-access sends it to {model} automatically, while the main model stays the brain of the conversation.',
    'popover.nativeVision.title': 'Native vision model',
    'popover.nativeVision.body': 'This model sees images natively: images go straight to the main model, with no transcription channel needed.',
    'popover.noVision.title': 'No vision capability',
    'popover.noVision.body': 'This model cannot see images and is outside the cross-model channel (DeepSeek text models only). Switch models to continue.',
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
      queryStatus: async (id: SessionId): Promise<VisionStatusResult> => {
        const response = await fetch(`/api/vision-access/status?sessionId=${encodeURIComponent(String(id))}`)
        if (!response.ok) return { mode: 'none', visionModel: '' }
        const payload = await response.json() as { mode?: string; visionModel?: string }
        const mode = payload.mode === 'native-vision' || payload.mode === 'no-vision' || payload.mode === 'cross-model'
          ? payload.mode
          : 'none'
        return { mode, visionModel: payload.visionModel ?? '' }
      },
    }),
  }, VisionStatusIcon))
}

export { ensureVisionStyles, VisionStatusIcon } from './VisionStatusIcon.js'
export type { VisionStatusInjected, VisionStatusProps, VisionStatusResult } from './VisionStatusIcon.js'
