/**
 * 模型事实表（client 侧单一来源）：事实只来自 host /api/codebuddy-credits/status
 * 的 models 列表——额度卡、设置卡片（手动刷新）读到状态时刷入，自建模型选择器
 * 按模型 id 查表渲染右侧只读事实。快照引用只在事实变化时更新（useSyncExternalStore 契约）。
 */

import { syncMaxMode } from './maxMode.js'
import { fetchLocal } from './fetch-timeout.js'

const STATUS_URL = '/api/codebuddy-credits/status'

/** 本插件 provider id：与 host `src/constants.ts` 的 `PROVIDER` 保持一致（选择器只对本 provider 的行套用事实表）。 */
export const PROVIDER_ID = 'codebuddy-credits'

/** 状态接口里的模型事实视图（额度卡/设置卡/选择器共用；host web.ts ModelFactView 的子集）。 */
export interface ModelFactView {
  id: string
  name: string
  /** 积分系数短串（"x0.79"），服务端未声明时缺省——只读事实行用。 */
  credits?: string
  vision: boolean
  contextWindow: number
  maxTokens: number
  description?: string
  efforts?: string[]
}

let modelFacts: ReadonlyMap<string, ModelFactView> = new Map()
const modelFactListeners = new Set<() => void>()
/** 单飞：选择器打开菜单而事实表尚空（额度卡/设置卡未挂载或尚未回包）时的补拉。 */
let modelFactsRequest: Promise<void> | undefined

/** 订阅模型事实变化（useSyncExternalStore 契约）。 */
export function subscribeModelFacts(fn: () => void): () => void {
  modelFactListeners.add(fn)
  return () => { modelFactListeners.delete(fn) }
}

/** 当前模型事实快照（按模型 id 建表）。 */
export function getModelFacts(): ReadonlyMap<string, ModelFactView> {
  return modelFacts
}

/** /status（或手动刷新响应）拿到模型清单时刷入事实表（各消费端同源）。 */
export function syncModelFacts(models: readonly ModelFactView[]): void {
  modelFacts = new Map(models.map(model => [model.id, model]))
  for (const fn of modelFactListeners) fn()
}

/**
 * 事实表为空时补一次 /status（与额度卡同一路由、单飞）；失败静默——
 * 没有事实的模型只显示名字，不报错、不显示占位符。
 */
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
