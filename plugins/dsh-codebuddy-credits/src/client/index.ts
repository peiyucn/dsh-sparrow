

import type { ReactNode } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'

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
    'autoAdapt.label': '自适应 API 拦截',
    'autoAdapt.hint': '被渠道校验拒绝时自动重试（最多 3 次额外请求，均进账号请求日志；极端情况会轻微改变模型行为）；关闭则直接报错',
    'autoAdapt.failed': '切换自适应 API 拦截失败，请重试',
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
    'autoAdapt.label': 'Adaptive API interception',
    'autoAdapt.hint': 'Retry automatically when the channel check rejects a request (up to 3 extra requests, all recorded in your account log; the extreme case may slightly change model behavior); off reports the error directly',
    'autoAdapt.failed': 'Failed to toggle adaptive API interception, please retry',
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

interface ClientProbeHost {
  readonly slots?: { readonly inject?: unknown; readonly register?: unknown }
  readonly locale?: { readonly register?: unknown; readonly bind?: unknown }
  readonly logger?: { warn(message: string): void }
}

export function apply(ctx: ClientContext): void {
  const c = ctx as unknown as ClientProbeHost


  if (!warnMissingCapabilities(c, SETTINGS_NAMESPACE, [
    { name: 'ctx.slots.inject', ok: hasCapability(() => c.slots?.inject) },
    { name: 'ctx.slots.register', ok: hasCapability(() => c.slots?.register) },
    { name: 'ctx.locale.register', ok: hasCapability(() => c.locale?.register) },
    { name: 'ctx.locale.bind', ok: hasCapability(() => c.locale?.bind) },
  ])) return


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


  const labelLocale = ctx.locale
  ctx.slots.inject('conversation.input.model.label', () => ctx.slots.register({
    name: 'conversation.input.model.label',
    locale: LOCALE_NAMESPACE,
    priority: -1,
    inject: () => ({
      resolveText: (text: string | { readonly en: string; readonly [locale: string]: string }) =>
        labelLocale.resolveText(text),
      subscribeLocale: (listener: () => void) => labelLocale.subscribe(listener),
      localeRevision: () => labelLocale.getSnapshot().revision,
    }),
  }, CodeBuddyModelLabel as unknown as (props: object) => ReactNode))


  const directoryFor = (sessionId: string): DirectoryStoreLike | undefined => {
    try {

      const resolver = ctx.root.get('modelDirectories') as unknown as {
        directoryFor(id: string): { store: DirectoryStoreLike } | undefined
      } | undefined

      return resolver?.directoryFor(sessionId)?.store
    } catch {
      return undefined
    }
  }


  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'codebuddy-credits',
    order: -10,
    locale: LOCALE_NAMESPACE,
    inject: () => ({ directoryFor }),
  }, CodeBuddyCreditsIndicator as unknown as (props: object) => ReactNode))



  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'codebuddy-credits-hero',
    order: 30,
    locale: LOCALE_NAMESPACE,
    inject: () => ({ directoryFor }),
  }, CodeBuddyCreditsHeroAnchor as unknown as (props: object) => ReactNode))


  ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
    name: 'conversation.chat.assistant-actions',
    id: 'codebuddy-credits-turn-credit',
    locale: LOCALE_NAMESPACE,
  }, CodeBuddyTurnCredit as unknown as (props: object) => ReactNode))



  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'codebuddy-credits-stats',
    order: 2,
    locale: LOCALE_NAMESPACE,
  }, CodeBuddyCreditsStats as unknown as (props: object) => ReactNode))

}
