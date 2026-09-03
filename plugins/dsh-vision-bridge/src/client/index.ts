/**
 * dsh-vision-bridge client half：模型选择器旁的状态图标（随模型能力三态，点击弹说明）。
 * 当前选中模型读官方共享模型目录（ctx.modelDirectories，与模型座位同 store、首帧同步）；
 * 能力模式查 host 能力路由（GET /api/vision-bridge/capability，无会话依赖，client 进程内缓存）。
 */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { ensureVisionStyles, VisionStatusIcon, type DirectoryStore, type VisionStatusResult } from './VisionStatusIcon.js'

export const inject = ['slots', 'locale']

/** 本插件的 locale 字典（zh/en）。 */
const LOCALE_DICTS = {
  zh: {
    'popover.crossModel.title': '可跨模型读图',
    'popover.crossModel.body': '直接发送图片即可：dsh-vision-bridge 会自动把图片交给 {model} 处理，主模型保持对话大脑。',
    'popover.nativeVision.title': '该模型原生支持视觉',
    'popover.nativeVision.body': '当前模型本身就支持看图：图片直达主模型，无需经视觉通道转述。',
    'popover.noVision.title': '该模型不支持看图',
    'popover.noVision.body': '当前模型不具备视觉能力，也不在此插件支持的跨模型读图范围内（仅 DeepSeek 文本模型）。请切换模型后再试。',
  },
  en: {
    'popover.crossModel.title': 'Cross-model image reading',
    'popover.crossModel.body': 'Just send an image: dsh-vision-bridge sends it to {model} automatically, while the main model stays the brain of the conversation.',
    'popover.nativeVision.title': 'Native vision model',
    'popover.nativeVision.body': 'This model sees images natively: images go straight to the main model, with no transcription channel needed.',
    'popover.noVision.title': 'No vision capability',
    'popover.noVision.body': 'This model cannot see images and is outside the cross-model channel (DeepSeek text models only). Switch models to continue.',
  },
} as const

/** 能力结果缓存：进程内按 provider:model 记忆（切模型即查，避免重复往返）。 */
const capabilityCache = new Map<string, VisionStatusResult>()
const capabilityInflight = new Map<string, Promise<VisionStatusResult>>()

/** host 能力查询：按 provider/model 取模式 + 视觉模型 id；provider 为空时查共享默认模型
 *  （会话历史未装载、座位目录尚未解析的窗口）；失败抛错（调用方隐藏图标）。 */
function queryCapability(provider: string, model: string): Promise<VisionStatusResult> {
  const key = `${provider}:${model}`
  const hit = capabilityCache.get(key)
  if (hit !== undefined) return Promise.resolve(hit)
  const inflight = capabilityInflight.get(key)
  if (inflight !== undefined) return inflight
  const task = (async (): Promise<VisionStatusResult> => {
    const url = provider === '' || model === ''
      ? '/api/vision-bridge/capability'
      : `/api/vision-bridge/capability?provider=${encodeURIComponent(provider)}&model=${encodeURIComponent(model)}`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`vision-bridge capability request failed (HTTP ${response.status})`)
    const payload = await response.json() as { mode?: unknown; visionModel?: unknown }
    if (payload.mode !== 'native-vision' && payload.mode !== 'cross-model' && payload.mode !== 'no-vision') {
      throw new Error(`vision-bridge capability: unexpected mode ${String(payload.mode)}`)
    }
    return { mode: payload.mode, visionModel: typeof payload.visionModel === 'string' ? payload.visionModel : '' }
  })()
  task.then((result) => { capabilityCache.set(key, result) }, () => {})
  capabilityInflight.set(key, task)
  void task.finally(() => {
    if (capabilityInflight.get(key) === task) capabilityInflight.delete(key)
  })
  return task
}

/**
 * client half 入口：注册 locale 字典 + 状态图标槽位。
 * @param ctx - 浏览器侧 Cordis 上下文。
 */
export function apply(ctx: ClientContext): void {
  const styles = ensureVisionStyles()
  ctx.effect(() => () => { styles.remove() }, 'dsh-vision-bridge: styles')
  const disposeDictionaries = ctx.locale.register('vision-bridge', { zh: LOCALE_DICTS.zh, en: LOCALE_DICTS.en })
  ctx.effect(() => disposeDictionaries, 'dsh-vision-bridge: locale dictionaries')

  // 官方共享模型目录（与模型座位同 store、首帧同步）；组合缺该服务（旧版 dsh）
  // 时 fail-soft：目录取不到 → 图标隐藏，不影响主流程。
  const directoryFor = (sessionId: SessionId): DirectoryStore | undefined => {
    try {
      const resolver = ctx.get('modelDirectories') as unknown as {
        directoryFor(id: SessionId): { store: DirectoryStore } | undefined
      } | undefined
      return resolver?.directoryFor(sessionId)?.store
    } catch {
      return undefined
    }
  }

  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'vision-bridge-status',
    order: 20,
    locale: 'vision-bridge',
    inject: () => ({ directoryFor, queryCapability }),
  }, VisionStatusIcon))
}

export { ensureVisionStyles, VisionStatusIcon } from './VisionStatusIcon.js'
export type { VisionStatusInjected, VisionStatusProps, VisionStatusResult } from './VisionStatusIcon.js'
