/**
 * dsh-codebuddy-credits client half：在官方设置 → 模型页的 CodeBuddy Credits
 * provider 行（settings.models.provider-card 槽位，key = 本插件命名空间）上
 * 挂 Key 配置卡。Key 只经本机 host 路由存入 DSH 凭据库；文案经 dsh locale。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { CodeBuddyCreditsCard } from './CodeBuddyCreditsCard.js'

export const inject = ['slots', 'locale']

const LOCALE_DICTS = {
  zh: {
    'key.placeholder': '粘贴 CodeBuddy API Key',
    'key.save': '保存',
    'key.remove': '移除',
    'models.refresh': '刷新模型',
    'models.added': '企业新放开了模型：{names}',
    'models.unchanged': '模型目录无变化（共 {count} 个）',
    'quota.line': '本期已用 {used} / 额度 {limit}（剩余 {remaining}）· 重置 {reset}',
    'state.configured': '已配置 · 模型 {count} 个 · {enterprise}',
    'state.missing': '未配置 Key：保存后自动获取账号可用模型',
    'state.active': '模型选择器可用',
    'saved': 'Key 已保存，模型目录已更新',
    'error.empty': '请输入 API Key',
    'error.saveFailed': '保存失败：请确认 Key 有效（保存时已尝试获取模型目录）',
    'error.removeFailed': '移除失败',
    'error.refreshFailed': '模型刷新失败',
  },
  en: {
    'key.placeholder': 'Paste CodeBuddy API key',
    'key.save': 'Save',
    'key.remove': 'Remove',
    'models.refresh': 'Refresh models',
    'models.added': 'New models granted by your admin: {names}',
    'models.unchanged': 'Model catalog unchanged ({count} models)',
    'quota.line': 'Cycle used {used} / limit {limit} (remaining {remaining}) · resets {reset}',
    'state.configured': 'Configured · {count} models · {enterprise}',
    'state.missing': 'No key: saving one fetches your account models',
    'state.active': 'Available in model picker',
    'saved': 'Key saved, model catalog updated',
    'error.empty': 'Enter an API key',
    'error.saveFailed': 'Save failed: check the key (catalog fetch runs on save)',
    'error.removeFailed': 'Remove failed',
    'error.refreshFailed': 'Model refresh failed',
  },
} as const

export function apply(ctx: ClientContext): void {
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
}
