

import { MAX_GROUP_CHARS, MAX_TASK_SESSIONS, TASK_STATUSES } from '../constants.js'
import type { TaskStatus } from '../contract.js'
import { DeskModelError } from './errors.js'

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (TASK_STATUSES as readonly string[]).includes(value)
}


function isValidDueDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function normalizeDue(raw: { readonly date?: unknown; readonly timezone?: unknown }): { date: string; timezone?: string } {
  if (typeof raw.date !== 'string' || !isValidDueDate(raw.date)) {
    throw new DeskModelError('INVALID_TASK', '截止日期必须是合法的 YYYY-MM-DD')
  }
  const timezone = typeof raw.timezone === 'string' ? raw.timezone.trim() : ''
  return { date: raw.date, ...(timezone === '' ? {} : { timezone }) }
}


export function normalizeOrder(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  return Math.round(value)
}


export function normalizeGroupName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const name = value.trim()
  if (name === '') return undefined
  if (name.length > MAX_GROUP_CHARS) {
    throw new DeskModelError('INVALID_GROUP', `分组名超过 ${MAX_GROUP_CHARS} 字符上限`)
  }
  return name
}


export function normalizeGroupId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const id = value.trim()
  return id === '' ? undefined : id
}


export function normalizeSessionIds(value: unknown): readonly string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new DeskModelError('INVALID_TASK', 'sessionIds 必须是字符串数组')
  const seen = new Set<string>()
  const ids: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') throw new DeskModelError('INVALID_TASK', 'sessionIds 必须是字符串数组')
    const id = item.trim()
    if (id === '' || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  if (ids.length > MAX_TASK_SESSIONS) {
    throw new DeskModelError('INVALID_TASK', `一张任务卡最多关联 ${MAX_TASK_SESSIONS} 个会话`)
  }
  return ids
}
