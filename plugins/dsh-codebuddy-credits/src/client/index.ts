/**
 * dsh-codebuddy-credits client half：
 * - settings.models.provider-card 槽位（key = 本插件命名空间）：设置 → 模型页
 *   的 CodeBuddy Credits 行挂 Key 配置卡（对齐 DeepSeek 极简交互）。
 * - conversation.session.header.actions 槽位：会话头部右上角挂 CodeBuddy 额度
 *   小卡（logo 展开：账号/额度/重置周期/当前模型信息）。
 * Key 只经本机 host 路由存入 DSH 凭据库；文案经 dsh locale。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { CodeBuddyCreditsCard } from './CodeBuddyCreditsCard.js'
import { CodeBuddyCreditsIndicator, ensureIndicatorStyles } from './CodeBuddyCreditsIndicator.js'

export const inject = ['slots', 'locale']

const LOCALE_DICTS = {
  zh: {
    'key.placeholder': '粘贴 CodeBuddy API Key',
    'key.save': '保存',
    'key.remove': '移除',
    'state.configured': '已配置 · {enterprise} · {type}',
    'state.missing': '未配置 Key：保存后自动获取账号可用模型',
    'saved': 'Key 已保存，模型目录已更新',
    'error.empty': '请输入 API Key',
    'error.saveFailed': '保存失败：请确认 Key 有效（保存时已尝试获取模型目录）',
    'error.removeFailed': '移除失败',
    'account.enterprise': '企业版',
    'account.personal': '个人版',
    'indicator.open': 'CodeBuddy 额度',
    'indicator.title': 'CodeBuddy Credits',
    'indicator.loading': '读取中…',
    'indicator.loadFailed': '额度信息读取失败',
    'indicator.noKey': '未配置 Key：请在 设置 → 模型 的 CodeBuddy Credits 行保存',
    'indicator.balance': '本期已用 {used} / 额度 {limit}（剩余 {remaining}）',
    'indicator.reset': '重置于 {reset}',
    'indicator.model.title': '当前模型',
    'indicator.model.context': '上下文 {context}',
    'indicator.model.vision': '原生视觉',
    'indicator.model.efforts': '思考档位：{efforts}',
  },
  en: {
    'key.placeholder': 'Paste CodeBuddy API key',
    'key.save': 'Save',
    'key.remove': 'Remove',
    'state.configured': 'Configured · {enterprise} · {type}',
    'state.missing': 'No key: saving one fetches your account models',
    'saved': 'Key saved, model catalog updated',
    'error.empty': 'Enter an API key',
    'error.saveFailed': 'Save failed: check the key (catalog fetch runs on save)',
    'error.removeFailed': 'Remove failed',
    'account.enterprise': 'Enterprise',
    'account.personal': 'Personal',
    'indicator.open': 'CodeBuddy credits',
    'indicator.title': 'CodeBuddy Credits',
    'indicator.loading': 'Loading…',
    'indicator.loadFailed': 'Failed to load credit info',
    'indicator.noKey': 'No key: save one under Settings → Models → CodeBuddy Credits',
    'indicator.balance': 'Cycle used {used} / limit {limit} (remaining {remaining})',
    'indicator.reset': 'Resets {reset}',
    'indicator.model.title': 'Current model',
    'indicator.model.context': 'Context {context}',
    'indicator.model.vision': 'Native vision',
    'indicator.model.efforts': 'Thinking levels: {efforts}',
  },
} as const

/** 官方共享模型目录 store 的最小形状（ui-model-selection 的公开 cordis 服务）。 */
interface DirectoryStoreLike {
  getSnapshot(): { current: unknown }
  subscribe(fn: () => void): () => void
}

export function apply(ctx: ClientContext): void {
  ensureIndicatorStyles()
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
}
