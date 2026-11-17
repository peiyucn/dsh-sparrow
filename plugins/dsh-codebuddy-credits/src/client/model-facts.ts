


export interface ModelFactView {
  id: string
  name: string

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
