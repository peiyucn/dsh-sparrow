/** 面板的纯展示格式化：字节 / token / 创建龄 / 会话事实行。零 React 依赖，便于单测。 */

import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { DAY_MS } from '../constants.js'

/** 会话事实行需要的字段（归档 / 游离条目共用）。 */
export interface SessionFactSource {
  readonly project?: string
  readonly turns?: number
  readonly tokens?: number
  readonly lastActiveAt?: number
  readonly sizeBytes?: number
  readonly createdAt: number
}

/** 创建龄文案：今天 / N 天前。 */
export function formatAge(t: TranslateNS<'archive-manage'>, createdAt: number | undefined): string {
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return ''
  const days = Math.floor((Date.now() - createdAt) / DAY_MS)
  return days <= 0 ? t('stray.ageToday') : t('stray.ageDays', { n: days })
}

/** 输出 token 数人类可读（1.2M / 30.8K / 512）。 */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/** 文件大小人类可读。 */
export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

/** 会话事实行：项目 · 轮数 · tok · 大小 · 时间（缺失项自动跳过）。 */
export function sessionFactLine(t: TranslateNS<'archive-manage'>, item: SessionFactSource): string {
  const parts = [
    item.project,
    item.turns !== undefined ? t('fact.turns', { n: item.turns }) : null,
    item.tokens !== undefined ? `${formatTokens(item.tokens)} tok` : null,
    item.sizeBytes !== undefined ? formatBytes(item.sizeBytes) : null,
    formatAge(t, item.lastActiveAt ?? item.createdAt),
  ].filter((part): part is string => typeof part === 'string' && part !== '')
  return parts.join(' · ')
}
