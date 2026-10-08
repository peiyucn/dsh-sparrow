/**
 * 模型事实表（client 侧单一来源）：事实只来自 host /api/codebuddy-credits/status
 * 的 models 列表——额度卡/设置卡读到状态时刷入，选择器按模型 id 查表渲染只读事实。
 * 快照引用只在事实变化时更新（useSyncExternalStore 契约）。
 */

import { syncMaxMode } from './maxMode.js'
import { fetchLocal } from './fetch-timeout.js'

const STATUS_URL = '/api/codebuddy-credits/status'

/** 本插件 provider id：与 host 的 PROVIDER 常量一致（选择器只对本 provider 的行套用事实表）。 */
export const PROVIDER_ID = 'codebuddy-credits'

/** 状态接口里的模型事实视图（host 同名类型的子集，各消费端共用）。 */
export interface ModelFactView {
  id: string
  name: string
  /** 积分系数短串（如 "x0.79"），服务端未声明时缺省。 */
  credits?: string
  vision: boolean
  contextWindow: number
  maxTokens: number
  description?: string
  efforts?: string[]
}

let modelFacts: ReadonlyMap<string, ModelFactView> = new Map()
const modelFactListeners = new Set<() => void>()
/** 单飞：事实表尚空时，选择器开菜单触发的补拉。 */
let modelFactsRequest: Promise<void> | undefined

export function subscribeModelFacts(fn: () => void): () => void {
  modelFactListeners.add(fn)
  return () => { modelFactListeners.delete(fn) }
}

export function getModelFacts(): ReadonlyMap<string, ModelFactView> {
  return modelFacts
}

export function syncModelFacts(models: readonly ModelFactView[]): void {
  modelFacts = new Map(models.map(model => [model.id, model]))
  for (const fn of modelFactListeners) fn()
}

/** 事实表为空时补一次 /status（与额度卡同一路由、单飞）；失败静默——缺事实的模型只显示名字。 */
export function ensureModelFacts(): void {
  if (modelFacts.size > 0 || modelFactsRequest !== undefined) return
  modelFactsRequest = fetchLocal(STATUS_URL, { cache: 'no-store' })
    .then(response => response.ok
      ? response.json() as Promise<{ models?: readonly ModelFactView[]; maxMode?: boolean }>
      : undefined)
    .then(payload => {
      if (payload === undefined) return
      syncModelFacts(payload.models ?? [])
      if (payload.maxMode !== undefined) syncMaxMode(payload.maxMode)
    })
    .catch(() => { /* 事实缺失：选择器只显示模型名 */ })
    .finally(() => { modelFactsRequest = undefined })
}
