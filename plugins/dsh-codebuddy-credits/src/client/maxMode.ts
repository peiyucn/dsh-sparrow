/**
 * Max 模式（推理档位锁）的 client 侧共享状态：
 * - 单一 store（订阅/快照），额度卡开关与模型选择器档位面板同源读取；
 * - 快照走 /status 顺带下发（maxMode 字段），打开面板/切会话/窗口聚焦时
 *   随 /status 自然刷新；开关写入走 /max-mode（乐观更新 + 广播）；
 * - 选择器不需要随 /status 全量拉取：订阅 'codebuddy-credits-status-changed'
 *   窗口事件（配置卡/本 store 都会广播）即可拿到新值。
 */

import { fetchLocal } from './fetch-timeout.js'
const MAX_MODE_URL = '/api/codebuddy-credits/max-mode'
/** Max 模式变化窗口事件（配置卡状态广播之外的专用通道：选择器跨组件联动）。 */
export const MAX_MODE_CHANGED_EVENT = 'codebuddy-credits-max-mode-changed'

let current = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const fn of listeners) fn()
  window.dispatchEvent(new Event(MAX_MODE_CHANGED_EVENT))
}

/** 额度卡/状态接口读到新的 maxMode 时同步进 store（变化才通知）。 */
export function syncMaxMode(value: boolean): void {
  if (value === current) return
  current = value
  emit()
}

/** 订阅 Max 模式变化（useSyncExternalStore 契约）：同组件树订阅 +
 *  跨组件树窗口事件（另一额度卡实例写入时本选择器同步）。 */
export function subscribeMaxMode(fn: () => void): () => void {
  listeners.add(fn)
  window.addEventListener(MAX_MODE_CHANGED_EVENT, fn)
  return () => {
    listeners.delete(fn)
    window.removeEventListener(MAX_MODE_CHANGED_EVENT, fn)
  }
}

/** 当前 Max 模式快照。 */
export function getMaxMode(): boolean {
  return current
}

/**
 * 写入 Max 模式：乐观更新 + 广播（选择器锁定态即时切换），
 * 失败时回滚并抛错（调用方给用户可见反馈）。
 */
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
