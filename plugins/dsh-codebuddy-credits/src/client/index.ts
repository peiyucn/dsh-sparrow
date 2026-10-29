/**
 * client half 挂**官方既有槽位**（不遮蔽任何官方控件）：settings.models.provider-card（Key 配置卡）、
 * conversation.session.header.utilities（额度小卡，order -10）等；模型选择器 = **官方 ui-model-selection**
 * （本插件的模型经 host 侧 ctx.llm.registerAdapter 注册进官方目录，官方菜单原生列出）。
 * ⚠️ **不得再注册 conversation.input.model**（那是遮蔽官方控件的旧做法）：自绘菜单要自己承担材质/portal/backdrop-filter，
 * 既重复官方能力，也把合成层的坑引进插件（owner：「codebuddy 根本就不该动官方模型菜单」）。
 * Key 经本机 host 路由存 DSH 凭据库，文案经 dsh locale。
 */

import type { ReactNode } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// 纯类型空导入：为 inject 用到的客户端服务提供类型声明，勿当死代码删。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { hasCapability, warnMissingCapabilities } from '../compat.js'
import { LOCALE_NAMESPACE, SETTINGS_NAMESPACE } from '../constants.js'
import { CodeBuddyCreditsCard } from './CodeBuddyCreditsCard.js'
import { CodeBuddyCreditsHeroAnchor, CodeBuddyCreditsIndicator } from './CodeBuddyCreditsIndicator.js'
import { CodeBuddyTurnCredit } from './CodeBuddyTurnCredit.js'
import { CodeBuddyCreditsStats } from './CodeBuddyCreditsStats.js'
import { CodeBuddyModelLabel } from './CodeBuddyModelLabel.js'
import { injectCodeBuddyStyles } from './styles.js'

export const inject = ['slots', 'locale']

const LOCALE_DICTS = {
  zh: {
    'key.label': 'API Key',
    'key.placeholder': '输入 API Key',
    'key.stored': '已配置——输入新值以替换',
    'key.illegal': 'API Key 格式不正确，请检查后重新粘贴',
    'action.cancel': '取消',
    'action.apply': '应用',
    'action.applying': '应用中…',
    'action.clearKey': '清空 Key',
    'error.clearFailed': '清空失败',
    'state.configured': '已配置 · {account}',
    'saved.provider': '已保存 CodeBuddy Credits。',
    'error.empty': '请输入 API Key',
    'error.saveFailed': '保存失败：请确认 Key 有效（保存时已尝试获取模型目录）',
    'account.enterprise': '企业版',
    'account.personal': '个人版',
    'indicator.open': 'CodeBuddy 额度',
    'indicator.title': 'CodeBuddy Credits',
    'indicator.loading': '读取中…',
    'indicator.profile': '打开 CodeBuddy 个人主页',
    'indicator.loadFailed': '额度信息读取失败',
    'indicator.quotaTitle': '当期额度消耗',
    'indicator.used': '已用 {used} / 额度 {limit} · {percent}%',
    'indicator.remainingLabel': '当期额度剩余',
    'indicator.reset': '额度重置时间 {reset}',
    'indicator.resetDays': '（{days}天后）',
    'turnCredit.aria': '本轮积分消耗 {credit}',
    'turnCredit.label': '积分 {credit}',
    'turnCredit.title': '本轮积分消耗',
    'turnCredit.calls': '调用次数',
    'turnCredit.perCall': '每次调用',
    'stats.sessionCredits': '积分 {credit} · {calls} 次调用',
    'stats.sessionCreditsAria': '本会话积分消耗 {credit}，{calls} 次调用',
    'stats.sessionCreditsTitle': '本会话积分消耗',
    'models.title': '可用模型',
    'models.fetch': '获取可用模型',
    'models.fetching': '正在询问提供方…',
    'models.updated': '已更新 {count} 个模型',
    'models.latest': '已是最新',
    'models.empty': '服务端暂未返回可用模型',
    'models.failed': '获取失败，请重试',
    'autoAdapt.label': '自动适配上游风控',
    'autoAdapt.hint': '被渠道校验拒绝时自动降级重试（最多 3 次额外请求，均进账号请求日志）；关闭则直接报错',
    'autoAdapt.failed': '切换自动适配失败，请重试',
    'indicator.model.features': '可用功能',
    'indicator.model.visionFeature': '图片输入',
    'indicator.model.reasoningFeature': '推理',
    'picker.trigger.loading': '正在加载模型…',
    'indicator.max.title': 'Max 模式',
    'indicator.max.hint': '开启后所有推理模型强制使用 Max 档位（CodeBuddy 客户端同款）',
    'indicator.max.failed': 'Max 模式切换失败，请重试',
  },
  en: {
    'key.label': 'API key',
    'key.placeholder': 'Enter your API key',
    'key.stored': 'Configured — enter a new value to replace',
    'key.illegal': 'This API key is not in a valid format. Please check it.',
    'action.cancel': 'Cancel',
    'action.apply': 'Apply',
    'action.applying': 'Applying…',
    'action.clearKey': 'Clear key',
    'error.clearFailed': 'Clear failed',
    'state.configured': 'Configured · {account}',
    'saved.provider': 'Saved CodeBuddy Credits.',
    'error.empty': 'Enter an API key',
    'error.saveFailed': 'Save failed: check the key (catalog fetch runs on save)',
    'account.enterprise': 'Enterprise',
    'account.personal': 'Personal',
    'indicator.open': 'CodeBuddy credits',
    'indicator.title': 'CodeBuddy Credits',
    'indicator.loading': 'Loading…',
    'indicator.profile': 'Open CodeBuddy profile',
    'indicator.loadFailed': 'Failed to load credit info',
    'indicator.quotaTitle': 'Current cycle usage',
    'indicator.used': 'Used {used} / limit {limit} · {percent}%',
    'indicator.remainingLabel': 'Current cycle remaining',
    'indicator.reset': 'Quota reset time {reset}',
    'indicator.resetDays': '({days} days)',
    'turnCredit.aria': 'Turn credits {credit}',
    'turnCredit.label': 'Credits {credit}',
    'turnCredit.title': 'Turn credits',
    'turnCredit.calls': 'Calls',
    'turnCredit.perCall': 'Per call',
    'stats.sessionCredits': 'Credits {credit} · {calls} calls',
    'stats.sessionCreditsAria': 'Session credits {credit}, {calls} calls',
    'stats.sessionCreditsTitle': 'Session credits',
    'models.title': 'Available models',
    'models.fetch': 'Fetch available models',
    'models.fetching': 'Asking the provider…',
    'models.updated': 'Updated {count} models',
    'models.latest': 'Already up to date',
    'models.empty': 'The provider returned no available models',
    'models.failed': 'Could not fetch models — try again',
    'autoAdapt.label': 'Auto-adapt upstream checks',
    'autoAdapt.hint': 'Retry with fallbacks when the channel check rejects a request (up to 3 extra requests, all recorded in your account log); off reports the error directly',
    'autoAdapt.failed': 'Failed to toggle auto-adapt, please retry',
    'indicator.model.features': 'Features',
    'indicator.model.visionFeature': 'Image input',
    'indicator.model.reasoningFeature': 'Reasoning',
    'picker.trigger.loading': 'Loading models…',
    'indicator.max.title': 'Max mode',
    'indicator.max.hint': 'Force all reasoning models to the Max effort level (same as the CodeBuddy client)',
    'indicator.max.failed': 'Failed to toggle Max mode, please retry',
  },
} as const

interface DirectoryStoreLike {
  getSnapshot(): { current: unknown }
  subscribe(fn: () => void): () => void
}

export function apply(ctx: ClientContext): void {
  const c = ctx as unknown as Record<string, any>
  // 首行能力门（**绝不抛错**）：client entry 非 active 会让宿主整页 boot 失败。
  // 缺失即直接 return，不注册任何样式 / 槽位 / 监听。
  if (!warnMissingCapabilities(c, SETTINGS_NAMESPACE, [
    { name: 'ctx.slots.inject', ok: hasCapability(() => c.slots?.inject) },
    { name: 'ctx.slots.register', ok: hasCapability(() => c.slots?.register) },
    { name: 'ctx.locale.register', ok: hasCapability(() => c.locale?.register) },
    { name: 'ctx.locale.bind', ok: hasCapability(() => c.locale?.bind) },
  ])) return

  // 样式表统一在这里注入一次（marker + HMR 复用）；卸载时移除。
  const style = injectCodeBuddyStyles()
  ctx.effect(() => () => { style.remove() }, `${SETTINGS_NAMESPACE}: styles`)
  const disposeDictionaries = ctx.locale.register(LOCALE_NAMESPACE, {
    zh: LOCALE_DICTS.zh,
    en: LOCALE_DICTS.en,
  })
  ctx.effect(() => disposeDictionaries, `${SETTINGS_NAMESPACE}: locale dictionaries`)

  ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register({
    name: 'settings.models.provider-card',
    key: SETTINGS_NAMESPACE,
    locale: LOCALE_NAMESPACE,
  }, CodeBuddyCreditsCard as unknown as (props: object) => ReactNode))

  /**
   * 模型行的只读事实（倍率 · 上下文）：官方 `conversation.input.model.label` 扩展槽的贡献者。
   *
   * ⚠️ 该槽是 **single**（官方 `ui-model-selection/src/client/slots.ts` 声明 `{ kind: 'single', scope: 'session', inline: true }`）：
   * 同一时刻只有一个贡献者渲染整条标签，官方自己的「1017 临时版本标」插件也是贡献者之一。所以：
   *  - 必须**同时保留官方的 1017 标**（按官方同条件镜像，`model-label-1017.ts`），并对其他 provider
   *    渲染与官方一致的「名字（+ 标）」；漏了就是弄丢官方功能；
   *  - `priority: -1` 是为了**稳定拿到渲染权**（否则谁注册得早谁赢，行为随加载顺序漂）；
   *  - 事实串只对本插件 provider 生效（`PROVIDER_ID`），且不显示在触发器上（`placement === 'trigger'`）。
   * ⚠️ 不注册父槽 `conversation.input.model`：选择控件仍归官方（见文件头注释）。
   */
  ctx.slots.inject('conversation.input.model.label', () => ctx.slots.register({
    name: 'conversation.input.model.label',
    locale: LOCALE_NAMESPACE,
    priority: -1,
  }, CodeBuddyModelLabel as unknown as (props: object) => ReactNode))

  // 读官方 ctx.modelDirectories（与模型选择器同一 store）；缺该服务时捕获返回 undefined。
  const directoryFor = (sessionId: string): DirectoryStoreLike | undefined => {
    try {
      // 必须从根上下文取：子上下文 get 会实例化出注入不全的副本。
      const resolver = ctx.root.get('modelDirectories') as unknown as {
        directoryFor(id: string): { store: DirectoryStoreLike } | undefined
      } | undefined
      // store 原样传递：快照/订阅依赖内部状态闭包，不做解构。
      return resolver?.directoryFor(sessionId)?.store
    } catch {
      return undefined
    }
  }

  // 官方 utilities 槽位（session log 下载按钮同槽位 order 0）：order -10 渲染在其左边。
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'codebuddy-credits',
    order: -10,
    locale: LOCALE_NAMESPACE,
    inject: () => ({ directoryFor }),
  }, CodeBuddyCreditsIndicator as unknown as (props: object) => ReactNode))

  // hero 态官方 header 整体隐藏（utilities 不渲染），额度入口改经
  // conversation.input.dock 挂载：读官方根元素 data-phase 标记，hero 相位 portal。
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'codebuddy-credits-hero',
    order: 30,
    locale: LOCALE_NAMESPACE,
    inject: () => ({ directoryFor }),
  }, CodeBuddyCreditsHeroAnchor as unknown as (props: object) => ReactNode))

  // 每轮积分胶囊：挂在官方 Usage 胶囊同槽位（assistant-actions）。
  ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
    name: 'conversation.chat.assistant-actions',
    id: 'codebuddy-credits-turn-credit',
    locale: LOCALE_NAMESPACE,
  }, CodeBuddyTurnCredit as unknown as (props: object) => ReactNode))

  // 会话积分统计行：官方 activity order 0、usage order 1（ui-chat StatsPills），本条目 order 2
  // 渲染在官方两颗胶囊之后（list 槽按 order 排，同 order 才需要 priority 决胜）。
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'codebuddy-credits-stats',
    order: 2,
    locale: LOCALE_NAMESPACE,
  }, CodeBuddyCreditsStats as unknown as (props: object) => ReactNode))

}
