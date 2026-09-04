/**
 * dsh-codebuddy-credits client half：
 * - conversation.input.model 槽位（priority -1 遮蔽官方 ModelSelect，官方
 *   注册表语义：同 cell 最低 priority 渲染）：自建模型选择器，模型行把
 *   积分系数右对齐（官方选择器只渲染 model.name）。行为/材质对齐官方。
 * - settings.models.provider-card 槽位（key = 本插件命名空间）：设置 → 模型页
 *   的 CodeBuddy Credits 行挂 Key 配置卡（对齐 DeepSeek 官方编辑器交互）。
 * - conversation.session.header.actions 槽位：会话头部右上角挂 CodeBuddy 额度
 *   小卡（文字 logo 展开：账号/额度进度条/重置日期/当前模型信息）。
 * Key 只经本机 host 路由存入 DSH 凭据库；文案经 dsh locale。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { CodeBuddyCreditsCard, ensureCardStyles } from './CodeBuddyCreditsCard.js'
import { CodeBuddyCreditsIndicator, ensureIndicatorStyles } from './CodeBuddyCreditsIndicator.js'
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
    'indicator.loadFailed': '额度信息读取失败',
    'indicator.quotaTitle': '当期额度消耗',
    'indicator.used': '已用 {used} / 额度 {limit} · {percent}%',
    'indicator.remainingLabel': '当期额度剩余',
    'indicator.reset': '额度重置时间 {reset}',
    'indicator.resetDays': '（{days}天后）',
    'indicator.sessionUsage': '本会话消耗：{credit} 积分 · {calls} 次调用',
    'indicator.recentCalls': '最近调用：',
    'indicator.callRow': '{model} · {credit} 积分',
    'turnCredit.aria': '本轮积分消耗 {credit}',
    'turnCredit.label': '积分 {credit}',
    'turnCredit.title': '本轮积分消耗',
    'turnCredit.total': '本轮合计',
    'turnCredit.calls': '调用次数',
    'turnCredit.recent': '每次调用',
    'stats.sessionCredits': 'CodeBuddy 积分 {credit} · {calls} 次调用',
    'indicator.model.title': '当前模型',
    'indicator.model.context': '上下文 {context}',
    'indicator.model.vision': '原生视觉',
    'indicator.model.efforts': '思考档位：{efforts}',
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
    'indicator.loadFailed': 'Failed to load credit info',
    'indicator.quotaTitle': 'Current cycle usage',
    'indicator.used': 'Used {used} / limit {limit} · {percent}%',
    'indicator.remainingLabel': 'Current cycle remaining',
    'indicator.reset': 'Quota reset time {reset}',
    'indicator.resetDays': '({days} days)',
    'indicator.sessionUsage': 'This session: {credit} credits · {calls} calls',
    'indicator.recentCalls': 'Recent calls:',
    'indicator.callRow': '{model} · {credit} credits',
    'turnCredit.aria': 'Turn credits {credit}',
    'turnCredit.label': 'Credits {credit}',
    'turnCredit.title': 'Turn credits',
    'turnCredit.total': 'Turn total',
    'turnCredit.calls': 'Calls',
    'turnCredit.recent': 'Per call',
    'stats.sessionCredits': 'CodeBuddy credits {credit} · {calls} calls',
    'indicator.model.title': 'Current model',
    'indicator.model.context': 'Context {context}',
    'indicator.model.vision': 'Native vision',
    'indicator.model.efforts': 'Thinking levels: {efforts}',
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
  },
} as const

/** 官方共享模型目录的最小形状（ui-model-selection 的公开 cordis 服务）。 */
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

  // 会话头部小卡：读官方 ctx.modelDirectories（公开 cordis 服务，与模型选择
  // 器同一 store）。组合缺该服务（旧版 dsh）时捕获并退回 useProjection 兜底。
  const directoryFor = (sessionId: string): DirectoryStoreLike | undefined => {
    try {
      // 根上下文取官方服务实例（子上下文 get 会实例化出注入不全的副本）。
      const resolver = ctx.root.get('modelDirectories') as unknown as {
        directoryFor(id: string): { store: DirectoryStoreLike } | undefined
      } | undefined
      // store 原样传递（快照/订阅方法可能依赖内部状态闭包，不做解构）。
      return resolver?.directoryFor(sessionId)?.store
    } catch {
      return undefined
    }
  }

  // 左侧栏 footer 额度入口：官方 Settings 的堆叠区（sidebar.footer.action
  // 槽位，公开 seam；Archive/Cloud Files 同款）。宽栏以 CSS 方案落在 Settings
  // 行右侧共用该行（官方 Settings 单槽不可加项）；rail 为常规圆形图标行。
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'codebuddy-credits',
    order: 40,
    locale: 'codebuddy-credits',
    inject: () => ({ directoryFor, variant: 'sidebar' as const }),
  }, CodeBuddyCreditsIndicator as unknown as (props: object) => ReactNode))

  // 每轮积分胶囊：官方 Usage 胶囊同排（assistant-actions 槽位，公开 seam）。
  // 该轮无 CodeBuddy 调用时组件返回 null，官方行动作行保持原样。
  ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
    name: 'conversation.chat.assistant-actions',
    id: 'codebuddy-credits-turn-credit',
    locale: 'codebuddy-credits',
  }, CodeBuddyTurnCredit as unknown as (props: object) => ReactNode))

  // 会话积分统计行：官方 StatsLine 同槽位（composer.dock，公开 seam），
  // order 1 渲染在官方统计行之后。无 CodeBuddy 调用时返回 null。
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'codebuddy-credits-stats',
    order: 1,
    locale: 'codebuddy-credits',
  }, CodeBuddyCreditsStats as unknown as (props: object) => ReactNode))

  // 模型选择器遮蔽：priority -1（官方条目为默认 0，最低者渲染）。
  // 双保险注册：(1) 声明式注入等 modelDirectories/sessions 就绪（官方同款
  // 姿势）；(2) 延迟重试兜底——若注入因任何原因未触发（时序/组合差异），
  // 服务可用后补注册。pickerRegistered 防重复；始终注册不上则保留官方
  // 选择器（fail-soft）。
  // 诊断：注册尝试与结果（刷新后仍回退官方样式时，请用户复制
  // JSON.stringify(window.__ccbDiag) 发回排查）。
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
    // 必须从根上下文取：官方 ui-model-selection 在根上下文注册该服务；
    // 在子上下文 get 会另行实例化，其 remote.session 等注入无法装配
    // （"cannot get property without inject"）——这正是目录空/弃权的根因。
    try {
      resolver = scopeCtx.root.get('modelDirectories') as unknown as typeof resolver
    } catch (error) {
      diag.serviceError = error instanceof Error ? error.message : String(error)
      return
    }
    try {
      sessions = scopeCtx.root.get('sessions') as unknown as typeof sessions
    } catch {
      // sessions 可选：缺失时按可用处理。
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
              // 惰性解析目录 store：首次 dispatch 时会话 scope 可能尚未就绪，
              // directoryFor 会抛错（抛错一次 = 槽位弃权，官方条目顶上）。
              // 这里绝不抛：解析失败保持未决，getSnapshot/load 后续重试，
              // 解析成功后通知等待中的订阅者（重挂载前自愈，不弃权）。
              let resolvedStore: DirectoryStoreLike | undefined
              const pending = new Set<() => void>()
              // 注意：必须是稳定引用（uSES 的 getSnapshot 每次返回新对象会
              // 触发无限重渲染，React #185「Maximum update depth exceeded」
              // → 槽位弃权回退官方——这正是刷新后样式回退的根因之一）。
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
                  // 会话 scope 未就绪：保持未决，下一次读取重试。
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
                  // load 与 select 一样是目录（ModelDirectory）的方法，store 没有——
                  // 必须解析目录本身；解析失败挂待命回调（解析成功后补一次 load），
                  // 每次开菜单还会重试。
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
                          // 会话 scope 仍未就绪：保持待命。
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
                  // select 是目录（ModelDirectory）的方法，store 没有——这里直接解析目录；
                  // 成功后把 current 乐观回写进共享 store：空白会话投影不下发，官方 select
                  // 末尾 syncInputs 读不到 current，座位/眼睛/信息卡就都看不到选择（点击"没反应"）。
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
  // 单一确定性路径：声明式注入等两个服务就绪后注册。根因修复后不再需要
  // 定时重试（服务解析从根上下文走，注入回调必然触发）。
  ctx.inject(['modelDirectories', 'sessions'], registerPicker)
}
