/**
 * 模块级共享 store：开关 / 联想中会话 / 错误 / 支持态 / 建议 / 灵敏度 + 采纳标记，持久化只存开关与灵敏度。
 * 开关（input.left）与数据面（input.dock）是两棵 React 树，用同一 bundle 内的可变状态 + 订阅器同步，
 * 避免靠 localStorage 事件（同页不触发）。所有 store 都不按会话累积。
 */

import { useEffect, useState } from 'react'
import { ENABLED_STORAGE_KEY, SENSITIVITY_STORAGE_KEY } from '../constants.js'
import { DEFAULT_TRIGGER_SENSITIVITY, normalizeTriggerSensitivity, type TriggerSensitivity } from '../suggest.js'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SuggestionRecord } from './contracts.js'
import {
  fimSupportReducer, fimSupportShown, initialFimSupportState, type FimSupportEvent, type FimSupportState,
} from './fim-support-machine.js'

/** 读取本地开关状态：默认关闭，仅显式存过 '1' 才开启；非法值回退关闭。 */
export function readEnabled(storage: { getItem(key: string): string | null }, key = ENABLED_STORAGE_KEY): boolean {
  const value = storage.getItem(key)
  return value === '1'
}

/** 一个模块级可变值 + 订阅器：写入相等值不通知（避免无意义重渲染）。 */
interface SharedStore<T> {
  get(): T
  set(next: T): void
  subscribe(listener: () => void): () => void
}

function createStore<T>(initial: T, persist?: (next: T) => void): SharedStore<T> {
  let current = initial
  const listeners = new Set<() => void>()
  return {
    get: () => current,
    set(next: T): void {
      if (current === next) return
      current = next
      persist?.(next)
      for (const listener of listeners) listener()
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

/**
 * 订阅 store 的 hook：首帧读 `read()`，订阅期间每次写入重新读；`deps` 变化时重挂（与手写订阅同一语义）。
 * 刻意不在重挂时补写状态——保持原先「等到下一次写入才刷新」的行为。
 */
function useSharedValue<T>(
  read: () => T,
  store: { subscribe(listener: () => void): () => void },
  deps: readonly unknown[] = [],
): T {
  const [value, setValue] = useState(read)
  useEffect(() => {
    const listener = (): void => { setValue(read()) }
    return store.subscribe(listener)
  }, deps)
  return value
}

/** 启动时读取本地持久化的开关值；隐私模式 / 配额满时按关闭处理（与写路径同防护）。 */
function readStoredEnabled(): boolean {
  try {
    return readEnabled(window.localStorage)
  } catch {
    return false
  }
}

const enabledStore = createStore(readStoredEnabled(), value => {
  try {
    window.localStorage.setItem(ENABLED_STORAGE_KEY, value ? '1' : '0')
  } catch {
    // 隐私模式/配额满：内存态已生效，持久化静默失败（与读路径同防护）。
  }
})

/** 订阅共享开关状态；返回当前值。 */
export function useSuggestEnabled(): boolean {
  return useSharedValue(enabledStore.get, enabledStore)
}

/** 设置共享开关并持久化；返回新值。 */
export function setSuggestEnabled(next: boolean): void {
  enabledStore.set(next)
}

const busyStore = createStore<string | null>(null)

/**
 * 订阅共享联想中状态。
 * @param sessionId - 指定时只反映该会话是否在联想；省略时反映「任意会话在联想」（开关胶囊用）。
 * @returns 该会话（或任意会话）是否正在联想。
 */
export function useSuggestBusy(sessionId?: string): boolean {
  const read = (): boolean => sessionId === undefined ? busyStore.get() !== null : busyStore.get() === sessionId
  return useSharedValue(read, busyStore, [sessionId])
}

/** 设置共享联想中会话（null = 无）。 */
export function setSuggestBusy(sessionId: string | null): void {
  busyStore.set(sessionId)
}

/** 只在「当前在联想的正是这个会话」时清除——后台会话迟到的结束回调不得清掉当前会话的环。 */
export function clearSuggestBusy(sessionId: string): void {
  if (busyStore.get() !== sessionId) return
  setSuggestBusy(null)
}

const errorStore = createStore<string | null>(null)

/** 订阅共享错误状态；返回当前值。 */
export function useSuggestError(): string | null {
  return useSharedValue(errorStore.get, errorStore)
}

/** 设置共享错误状态。 */
export function setSuggestError(next: string | null): void {
  errorStore.set(next)
}

// 主模型非 deepseek 系列时整体隐藏（像没装插件）。判定管线（idle → checking ⇄ retrying →
// supported/unsupported/failed）由 fim-support-machine 的纯 reducer 驱动，事件带会话+模型地址，
// 旧响应在状态机里被结构性作废。「宿主判不了」（冷启动会话未激活）单独成相并做有界补查——
// 不与「判为不支持」混同，见 fim-support-machine 顶部注释。
const supportStore = createStore<FimSupportState>(initialFimSupportState)

/** 订阅共享模型支持状态机全量状态（dock 据此驱动查询）。 */
export function useSuggestSupportState(): FimSupportState {
  return useSharedValue(supportStore.get, supportStore)
}

/** 订阅共享模型支持布尔态（开关/菜单只关心显隐）。 */
export function useSuggestSupported(): boolean {
  return fimSupportShown(useSuggestSupportState())
}

/** 派发支持状态机事件；reducer 判定无效事件（旧地址/阶段不符）并原样忽略。 */
export function dispatchSupportEvent(event: FimSupportEvent): void {
  const current = supportStore.get()
  const next = fimSupportReducer(current, event)
  if (next === current) return
  supportStore.set(next)
}

const suggestionStore = createStore<SuggestionRecord | null>(null)

/** 订阅共享建议；返回当前记录。 */
export function useSuggestion(): SuggestionRecord | null {
  return useSharedValue(suggestionStore.get, suggestionStore)
}

/** 设置共享建议（null = 清空）。 */
export function setSuggestion(next: SuggestionRecord | null): void {
  suggestionStore.set(next)
}

// 最近一次采纳：菜单 Tab/点选采纳前记录预期采纳（新草稿 = 旧草稿 + 建议文本），
// dock 在草稿按此变化时跳过触发并消费标记——否则采纳后新草稿会立刻再次触发联想，
// 建议马上复现（且上游常以「助手：」口吻续写）。采纳失败（bail CAS 拒绝）回滚清除。
let lastAdoption: { sessionId: SessionId; draft: string; text: string } | null = null

/** 菜单采纳前记录预期采纳。 */
export function markSuggestAdoption(adoption: { sessionId: SessionId; draft: string; text: string }): void {
  lastAdoption = adoption
}

/** 清除采纳标记（采纳失败回滚 / dock 消费后）。 */
export function clearSuggestAdoption(): void {
  lastAdoption = null
}

/** 只读当前采纳标记。 */
export function peekSuggestAdoption(): { sessionId: SessionId; draft: string; text: string } | null {
  return lastAdoption
}

/** 启动时读取本地灵敏度；读不到 / 非法值都与 normalizeTriggerSensitivity 同一套回退，故不另写一份规则。 */
function readStoredSensitivity(): TriggerSensitivity {
  try {
    return normalizeTriggerSensitivity(window.localStorage.getItem(SENSITIVITY_STORAGE_KEY))
  } catch {
    return DEFAULT_TRIGGER_SENSITIVITY
  }
}

const sensitivityStore = createStore<TriggerSensitivity>(readStoredSensitivity(), next => {
  try {
    window.localStorage.setItem(SENSITIVITY_STORAGE_KEY, next)
  } catch {
    // 隐私模式/配额满：内存态已生效，持久化静默失败（与读路径同防护）。
  }
})

/** 订阅共享触发灵敏度。 */
export function useTriggerSensitivity(): TriggerSensitivity {
  return useSharedValue(sensitivityStore.get, sensitivityStore)
}

/** 设置共享触发灵敏度并持久化。 */
export function setTriggerSensitivity(next: TriggerSensitivity): void {
  sensitivityStore.set(next)
}
