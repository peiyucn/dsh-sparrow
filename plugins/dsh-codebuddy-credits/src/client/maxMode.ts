/**
 * Max 模式（推理档位锁）的 client 侧共享 store：额度卡开关与模型选择器档位
 * 面板同源读取。快照随 /status 的 maxMode 字段刷新，写入走 /max-mode
 * （乐观更新 + 广播），选择器另订阅 MAX_MODE_CHANGED_EVENT 跨组件联动。
 */

import { fetchLocal } from './fetch-timeout.js'
const MAX_MODE_URL = '/api/codebuddy-credits/max-mode'
/** Max 模式变化的窗口事件：选择器跨组件树联动用。 */
export const MAX_MODE_CHANGED_EVENT = 'codebuddy-credits-max-mode-changed'

let current = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const fn of listeners) fn()
  window.dispatchEvent(new Event(MAX_MODE_CHANGED_EVENT))
}

export function syncMaxMode(value: boolean): void {
  if (value === current) return
  current = value
  emit()
}

/** 订阅 Max 模式变化（useSyncExternalStore 契约）：本树订阅 + 窗口事件跨树联动。 */
export function subscribeMaxMode(fn: () => void): () => void {
  listeners.add(fn)
  window.addEventListener(MAX_MODE_CHANGED_EVENT, fn)
  return () => {
    listeners.delete(fn)
    window.removeEventListener(MAX_MODE_CHANGED_EVENT, fn)
  }
}

export function getMaxMode(): boolean {
  return current
}

/** 写入 Max 模式：乐观更新 + 广播；失败回滚并抛错（调用方给用户可见反馈）。 */
export async function setMaxMode(enabled: boolean): Promise<void> {
  const prev = current
  syncMaxMode(enabled)
  try {
    const response = await fetchLocal(MAX_MODE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled }),
      cache: 'no-store',
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string }
      throw new Error(payload.error ?? 'HTTP ' + String(response.status))
    }
    const payload = await response.json() as { maxMode?: boolean }
    syncMaxMode(payload.maxMode === true)
  } catch (error) {
    syncMaxMode(prev)
    throw error
  }
}
