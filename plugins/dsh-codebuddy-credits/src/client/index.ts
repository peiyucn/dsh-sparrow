/**
 * client half 挂三个官方槽位：conversation.input.model（priority -1 遮蔽官方 ModelSelect）、
 * settings.models.provider-card（Key 配置卡）、conversation.session.header.utilities
 * （额度小卡，order -10）；Key 经本机 host 路由存 DSH 凭据库，文案经 dsh locale。
 */

import type { ReactNode } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// 纯类型空导入：为 inject 用到的客户端服务提供类型声明，勿当死代码删。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { CodeBuddyCreditsCard, ensureCardStyles } from './CodeBuddyCreditsCard.js'
import {
  CodeBuddyCreditsHeroAnchor,
  CodeBuddyCreditsIndicator,
  ensureIndicatorStyles,
} from './CodeBuddyCreditsIndicator.js'
import { CodeBuddyModelSelect, ensurePickerStyles } from './CodeBuddyModelSelect.js'
import { CodeBuddyTurnCredit, ensureTurnCreditStyles } from './CodeBuddyTurnCredit.js'
import { CodeBuddyCreditsStats, ensureStatsStyles } from './CodeBuddyCreditsStats.js'

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
    'state.configuredShort': '已配置',
    'action.edit': '编辑',
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
    'indicator.model.features': '可用功能',
    'indicator.model.visionFeature': '图片输入',
    'indicator.model.reasoningFeature': '推理',
    'picker.trigger.fallback': '选择模型',
    'picker.trigger.loading': '正在加载模型…',
    'picker.trigger.selectAria': '选择模型',
    'picker.trigger.aria': '选择模型，当前 {model}',
    'picker.trigger.ariaEffort': '选择模型，当前 {model}，推理等级 {effort}',
    'picker.menu.aria': '模型与推理等级',
    'picker.menu.model': '模型',
    'picker.menu.effort': '推理等级',
    'picker.effort.providerDefault': 'Default',
    'picker.status.loading': '正在刷新模型列表…',
    'picker.error.action': '模型操作失败：{message}',
    'picker.action.reload': '重新加载',
    'picker.warning.groupLoad': '{name} 加载失败：{message}',
    'picker.empty.models': '没有可用的模型。',
    'picker.empty.efforts': '当前模型未提供推理等级。',
    'picker.effort.max': 'Max',
    'picker.max.locked': '已被 Max 模式锁定 — 在额度卡关闭后可调',
    'picker.max.lockedHint': 'Max 模式锁定中',
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
    'state.configuredShort': 'Configured',
    'action.edit': 'Edit',
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
    'indicator.model.features': 'Features',
    'indicator.model.visionFeature': 'Image input',
    'indicator.model.reasoningFeature': 'Reasoning',
    'picker.trigger.fallback': 'Select model',
    'picker.trigger.loading': 'Loading models…',
    'picker.trigger.selectAria': 'Select model',
    'picker.trigger.aria': 'Select model, current {model}',
    'picker.trigger.ariaEffort': 'Select model, current {model}, reasoning effort {effort}',
    'picker.menu.aria': 'Model and reasoning effort',
    'picker.menu.model': 'Model',
    'picker.menu.effort': 'Effort',
    'picker.effort.providerDefault': 'Default',
    'picker.status.loading': 'Refreshing model list…',
    'picker.error.action': 'Model operation failed: {message}',
    'picker.action.reload': 'Reload',
    'picker.warning.groupLoad': '{name} failed to load: {message}',
    'picker.empty.models': 'No models available.',
    'picker.empty.efforts': 'This model provides no reasoning effort levels.',
    'picker.effort.max': 'Max',
    'picker.max.locked': 'Locked by Max mode — turn it off in the credits card to adjust',
    'picker.max.lockedHint': 'Locked by Max mode',
    'indicator.max.title': 'Max mode',
    'indicator.max.hint': 'Force all reasoning models to the Max effort level (same as the CodeBuddy client)',
    'indicator.max.failed': 'Failed to toggle Max mode, please retry',
  },
} as const

/** 官方共享模型目录（ui-model-selection 服务）的最小形状。 */
interface ModelDirectoryLike {
  readonly store: {
    getSnapshot(): unknown
    subscribe(fn: () => void): () => void
  }
  load(): Promise<unknown>
  select(selection: unknown): Promise<unknown>
}

interface DirectoryStoreLike {
  getSnapshot(): { current: unknown }
  subscribe(fn: () => void): () => void
}

export function apply(ctx: ClientContext): void {
  ensureIndicatorStyles()
  ensurePickerStyles()
  ensureCardStyles()
  ensureTurnCreditStyles()
  ensureStatsStyles()
  const disposeDictionaries = ctx.locale.register('codebuddy-credits', {
    zh: LOCALE_DICTS.zh,
    en: LOCALE_DICTS.en,
  })
  ctx.effect(() => disposeDictionaries, 'llm-codebuddy-credits: locale dictionaries')

  ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register({
    name: 'settings.models.provider-card',
    key: 'llm-codebuddy-credits',
    locale: 'codebuddy-credits',
  }, CodeBuddyCreditsCard as unknown as (props: object) => ReactNode))

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
    locale: 'codebuddy-credits',
    inject: () => ({ directoryFor }),
  }, CodeBuddyCreditsIndicator as unknown as (props: object) => ReactNode))

  // hero 态官方 header 整体隐藏（utilities 不渲染），额度入口改经
  // conversation.input.dock 挂载：读官方根元素 data-phase 标记，hero 相位 portal。
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'codebuddy-credits-hero',
    order: 30,
    locale: 'codebuddy-credits',
    inject: () => ({ directoryFor }),
  }, CodeBuddyCreditsHeroAnchor as unknown as (props: object) => ReactNode))

  // 每轮积分胶囊：挂在官方 Usage 胶囊同槽位（assistant-actions）。
  ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
    name: 'conversation.chat.assistant-actions',
    id: 'codebuddy-credits-turn-credit',
    locale: 'codebuddy-credits',
  }, CodeBuddyTurnCredit as unknown as (props: object) => ReactNode))

  // 会话积分统计行：order 1 接在官方 StatsLine 之后（composer.dock 槽位）。
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'codebuddy-credits-stats',
    order: 1,
    locale: 'codebuddy-credits',
  }, CodeBuddyCreditsStats as unknown as (props: object) => ReactNode))

  // priority -1 遮蔽官方条目（同 cell 最低者渲染）；注册不上则保留官方选择器。
  // __ccbDiag 是给用户排查回退问题用的诊断快照，勿删。
  const diag: {
    attempts: number
    serviceError?: string
    injectError?: string
    registered: boolean
    registerError?: string
    sessionId?: string
    ensureFails: number
    ensureError?: string
  } = {
    attempts: 0,
    registered: false,
    ensureFails: 0,
  }
  ;(window as unknown as Record<string, unknown>).__ccbDiag = diag
  let pickerRegistered = false
  const registerPicker = (scopeCtx: ClientContext): void => {
    if (pickerRegistered) return
    diag.attempts += 1
    let resolver: { directoryFor(id: string): { store: DirectoryStoreLike } | undefined }
    let sessions: { subagentAddress(id: string): unknown } | undefined
    // 必须从根上下文取：子上下文 get 会另行实例化且注入不全（目录空/槽位弃权的根因）。
    try {
      resolver = scopeCtx.root.get('modelDirectories') as unknown as typeof resolver
    } catch (error) {
      diag.serviceError = error instanceof Error ? error.message : String(error)
      return
    }
    try {
      sessions = scopeCtx.root.get('sessions') as unknown as typeof sessions
    } catch {
      // sessions 可选：缺失按可用处理。
    }
    try {
      scopeCtx.slots.inject('conversation.input.model', () => {
        try {
          const dispose = scopeCtx.slots.register({
            name: 'conversation.input.model',
            locale: 'codebuddy-credits',
            priority: -1,
            inject: (sessionId: string) => {
              diag.sessionId = String(sessionId)
              // 惰性解析目录 store：首次 dispatch 时会话 scope 可能未就绪，
              // directoryFor 抛错即槽位弃权，故这里绝不抛——失败保持未决、后续重试。
              let resolvedStore: DirectoryStoreLike | undefined
              const pending = new Set<() => void>()
              // 必须是稳定引用：uSES 下 getSnapshot 每次返回新对象会无限重渲染
              // （React #185），槽位弃权回退官方。
              const emptySnapshot = { current: null, routable: null, groups: [], failures: [], status: 'idle', error: null }
              const ensure = (): DirectoryStoreLike | undefined => {
                if (resolvedStore !== undefined) return resolvedStore
                try {
                  const hit: DirectoryStoreLike | undefined = resolver.directoryFor(sessionId)?.store
                  if (hit !== undefined) {
                    resolvedStore = hit
                    for (const fn of pending) fn()
                    pending.clear()
                  }
                } catch (error) {
                  diag.ensureFails += 1
                  diag.ensureError = error instanceof Error ? error.message : String(error)
                }
                return resolvedStore
              }
              const available = sessions === undefined
                || (() => {
                  try {
                    return sessions.subagentAddress(sessionId) === undefined
                  } catch {
                    return true
                  }
                })()
              return {
                available,
                directory: {
                  getSnapshot: () => {
                    const hit = ensure()
                    return hit !== undefined ? hit.getSnapshot() : emptySnapshot
                  },
                  subscribe: (fn: () => void): (() => void) => {
                    const hit = ensure()
                    if (hit !== undefined) return hit.subscribe(fn)
                    pending.add(fn)
                    return () => { pending.delete(fn) }
                  },
                } as unknown as DirectoryStoreLike,
                load: () => {
                  // load/select 是目录（ModelDirectory）的方法，store 没有——必须解析
                  // 目录本身；解析失败挂待命回调（成功后补一次），开菜单时还会重试。
                  let directory: ModelDirectoryLike | undefined
                  try {
                    directory = resolver.directoryFor(sessionId) as unknown as ModelDirectoryLike | undefined
                  } catch {
                    if (available) {
                      pending.add(() => {
                        try {
                          ;(resolver.directoryFor(sessionId) as unknown as ModelDirectoryLike | undefined)
                            ?.load().catch(() => { /* 错误落在 store 上 */ })
                        } catch {
                          // 仍未就绪：保持待命。
                        }
                      })
                    }
                    return
                  }
                  if (directory !== undefined) {
                    directory.load().catch(() => { /* 错误落在 store 上 */ })
                  }
                },
                select: (selection: unknown) => {
                  // select 同为目录方法（store 没有）；成功后把 current 乐观回写进共享
                  // store——否则官方 syncInputs 读不到 current，UI 显示不出所选模型。
                  let directory: ModelDirectoryLike | undefined
                  try {
                    directory = resolver.directoryFor(sessionId) as unknown as ModelDirectoryLike | undefined
                  } catch {
                    return Promise.resolve(false)
                  }
                  if (directory === undefined) return Promise.resolve(false)
                  return directory.select(selection).then(() => {
                    ;(directory!.store as unknown as { update(fn: (s: { current: unknown }) => void): void })
                      .update(s => { s.current = selection })
                    return true
                  }, () => false)
                },
              }
            },
          }, CodeBuddyModelSelect as unknown as (props: object) => ReactNode)
          diag.registered = true
          return dispose
        } catch (error) {
          diag.registerError = error instanceof Error ? error.message : String(error)
          return () => {}
        }
      })
      pickerRegistered = true
    } catch (error) {
      diag.injectError = error instanceof Error ? error.message : String(error)
    }
  }
  // 声明式注入：等两个服务就绪后注册（服务从根上下文解析，回调必然触发，无需重试）。
  ctx.inject(['modelDirectories', 'sessions'], registerPicker)
}
