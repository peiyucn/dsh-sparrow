/**
 * 模型事实表（client 侧单一来源）：事实只来自 host /status 的 models 列表——额度卡 / 设置卡
 * 读到状态时刷入，选择器按模型 id 查表渲染只读事实。快照引用只在事实变化时更新
 * （`useSyncExternalStore` 契约）。
 */

/** 状态接口里的模型事实视图（host 同名类型的子集，各消费端共用）。 */
export interface ModelFactView {
  id: string
  name: string
  /** 积分系数短串（如 "x0.79"），服务端未声明时缺省。 */
  credits?: string
  vision: boolean
  contextWindow: number
  description?: string
  efforts?: string[]
}

let modelFacts: ReadonlyMap<string, ModelFactView> = new Map()
const modelFactListeners = new Set<() => void>()

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
