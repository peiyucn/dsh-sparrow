/**
 * dsh-vision-bridge client half：模型选择器旁的状态图标（随模型能力三态，点击弹说明）。
 * 无持久状态；可用性判定与视觉模型 id 全在 host（GET /api/vision-bridge/status）；
 * 模型切换经会话 modelSelection 投影（官方 faceOf seam）订阅，实时跟随。
 */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { ensureVisionStyles, VisionStatusIcon, type VisionStatusResult } from './VisionStatusIcon.js'

export const inject = ['slots', 'locale', 'sessions']

/** 本插件的 locale 字典（zh/en）。 */
const LOCALE_DICTS = {
  zh: {
    'popover.crossModel.title': '可跨模型读图',
    'popover.crossModel.body': '直接发送图片即可：dsh-vision-bridge 会自动把图片交给 {model} 处理，主模型保持对话大脑。',
    'popover.noVision.title': '该模型不支持看图',
    'popover.noVision.body': '当前模型不具备视觉能力，也不在此插件支持的跨模型读图范围内（仅 DeepSeek 文本模型）。请切换模型后再试。',
  },
  en: {
    'popover.crossModel.title': 'Cross-model image reading',
    'popover.crossModel.body': 'Just send an image: dsh-vision-bridge sends it to {model} automatically, while the main model stays the brain of the conversation.',
    'popover.noVision.title': 'No vision capability',
    'popover.noVision.body': 'This model cannot see images and is outside the cross-model channel (DeepSeek text models only). Switch models to continue.',
  },
} as const

/** 客户端 sessions 服务的最小面：按会话 id 拿 Session 的投影 face（官方 seam）。 */
interface VisionClientSessions {
  binding(id: SessionId): {
    session: {
      projections: {
        faceOf(key: string): { subscribe(listener: () => void): () => void }
      }
    }
  } | undefined
}

/**
 * client half 入口：注册 locale 字典 + 状态图标槽位。
 * @param ctx - 浏览器侧 Cordis 上下文。
 */
export function apply(ctx: ClientContext): void {
  const sessions = ctx.sessions as unknown as VisionClientSessions
  const styles = ensureVisionStyles()
  ctx.effect(() => () => { styles.remove() }, 'dsh-vision-bridge: styles')
  const disposeDictionaries = ctx.locale.register('vision-bridge', { zh: LOCALE_DICTS.zh, en: LOCALE_DICTS.en })
  ctx.effect(() => disposeDictionaries, 'dsh-vision-bridge: locale dictionaries')

  const injectedFace = (sessionId: SessionId) => {
    const face = sessions.binding(sessionId)?.session.projections.faceOf('modelSelection')
    return {
      queryStatus: async (id: SessionId): Promise<VisionStatusResult> => {
        const response = await fetch(`/api/vision-bridge/status?sessionId=${encodeURIComponent(String(id))}`)
        if (!response.ok) return { mode: 'none', visionModel: '' }
        const payload = await response.json() as { mode?: string; visionModel?: string }
        const mode = payload.mode === 'native-vision' || payload.mode === 'no-vision' || payload.mode === 'cross-model'
          ? payload.mode
          : 'none'
        return { mode, visionModel: payload.visionModel ?? '' }
      },
      subscribeModelChange: (listener: () => void): (() => void) => {
        if (face === undefined) return () => {}
        return face.subscribe(listener)
      },
    }
  }

  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'vision-bridge-status',
    order: 20,
    locale: 'vision-bridge',
    inject: injectedFace,
  }, VisionStatusIcon))
}

export { ensureVisionStyles, VisionStatusIcon } from './VisionStatusIcon.js'
export type { VisionStatusInjected, VisionStatusProps, VisionStatusResult } from './VisionStatusIcon.js'
