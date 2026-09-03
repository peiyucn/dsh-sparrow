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
      const resolver = ctx.get('modelDirectories') as unknown as {
        directoryFor(id: string): { store: DirectoryStoreLike } | undefined
      } | undefined
      // store 原样传递（快照/订阅方法可能依赖内部状态闭包，不做解构）。
      return resolver?.directoryFor(sessionId)?.store
    } catch {
      return undefined
    }
  }

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'llm-codebuddy-credits',
    locale: 'codebuddy-credits',
    inject: () => ({ directoryFor }),
  }, CodeBuddyCreditsIndicator as unknown as (props: object) => ReactNode))

  // 模型选择器遮蔽：priority -1（官方条目为默认 0，最低者渲染）。
  // 双保险注册：(1) 声明式注入等 modelDirectories/sessions 就绪（官方同款
  // 姿势）；(2) 延迟重试兜底——若注入因任何原因未触发（时序/组合差异），
  // 服务可用后补注册。pickerRegistered 防重复；始终注册不上则保留官方
  // 选择器（fail-soft）。
  // 诊断：注册尝试与结果（刷新后仍回退官方样式时，请用户复制
  // JSON.stringify(window.__ccbDiag) 发回排查）。
  const diag: { attempts: number; serviceError?: string; injectError?: string; registered: boolean; registerError?: string } = {
    attempts: 0,
    registered: false,
  }
  ;(window as unknown as Record<string, unknown>).__ccbDiag = diag
  let pickerRegistered = false
  const registerPicker = (scopeCtx: ClientContext): void => {
    if (pickerRegistered) return
    diag.attempts += 1
    let resolver: { directoryFor(id: string): ModelDirectoryLike | undefined }
    let sessions: { subagentAddress(id: string): unknown } | undefined
    try {
      resolver = scopeCtx.get('modelDirectories') as never
    } catch (error) {
      diag.serviceError = error instanceof Error ? error.message : String(error)
      return
    }
    try {
      sessions = scopeCtx.get('sessions') as never
    } catch {
      // sessions 可选：缺失时按可用处理。
    }
    // 未知会话（目录解析失败）时给一个空目录 + 禁用态，避免渲染抛错。
    const emptyDirectory = (): ModelDirectoryLike => {
      const snapshot = { current: null, routable: null, groups: [], failures: [], status: 'idle', error: null }
      return {
        store: {
          getSnapshot: () => snapshot,
          subscribe: () => () => {},
        },
        load: async () => {},
        select: async () => {},
      }
    }
    try {
      scopeCtx.slots.inject('conversation.input.model', () => {
        try {
          const dispose = scopeCtx.slots.register({
            name: 'conversation.input.model',
            locale: 'codebuddy-credits',
            priority: -1,
            inject: (sessionId: string) => {
              const directory = resolver.directoryFor(sessionId) ?? emptyDirectory()
              const available = directory !== undefined
                && (sessions === undefined || sessions.subagentAddress(sessionId) === undefined)
              return {
                available,
                directory: directory.store,
                load: () => {
                  if (available) directory.load().catch(() => { /* 错误落在 store 上 */ })
                },
                select: (selection: unknown) => available
                  ? directory.select(selection).then(() => true, () => false)
                  : Promise.resolve(false),
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
  ctx.inject(['modelDirectories', 'sessions'], registerPicker)
  const retryDelays = [1_000, 3_000, 8_000]
  for (let i = 0; i < retryDelays.length; i++) {
    const timer = setTimeout(() => { registerPicker(ctx) }, retryDelays[i])
    ctx.effect(() => () => { clearTimeout(timer) }, 'llm-codebuddy-credits: picker retry ' + String(i))
  }
}
