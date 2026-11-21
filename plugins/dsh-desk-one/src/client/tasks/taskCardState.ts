import { TASK_CARD_STATE_LIMIT, TASK_CARD_STATE_STORAGE_KEY } from '../../constants.js'

export type TaskCardUiState = {
  readonly card?: 'collapsed'
  readonly body?: 'expanded'
}

export type TaskCardUiStateMap = Record<string, TaskCardUiState>

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function browserStorage(): StorageLike | undefined {
  try {
    if (typeof window === 'undefined') return undefined
    return window.localStorage
  } catch {
    return undefined
  }
}

function normalizeState(value: unknown): TaskCardUiState {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  const record = value as Record<string, unknown>
  return {
    ...(record.card === 'collapsed' ? { card: 'collapsed' as const } : {}),
    ...(record.body === 'expanded' ? { body: 'expanded' as const } : {}),
  }
}

export function loadTaskCardStates(storage: StorageLike | undefined = browserStorage()): TaskCardUiStateMap {
  if (storage === undefined) return {}
  let raw: string | null
  try {
    raw = storage.getItem(TASK_CARD_STATE_STORAGE_KEY)
  } catch {
    return {}
  }
  if (raw === null || raw === '') return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const states: TaskCardUiStateMap = {}
  for (const [taskId, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (taskId === '') continue
    const state = normalizeState(value)
    if (state.card !== undefined || state.body !== undefined) states[taskId] = state
  }
  return states
}

export function setTaskCardUi(
  states: TaskCardUiStateMap,
  taskId: string,
  state: TaskCardUiState,
): TaskCardUiStateMap {
  const next: TaskCardUiStateMap = { ...states }
  if (state.card === undefined && state.body === undefined) delete next[taskId]
  else next[taskId] = state
  const keys = Object.keys(next)
  for (const key of keys.slice(0, Math.max(0, keys.length - TASK_CARD_STATE_LIMIT))) delete next[key]
  return next
}

export function readTaskCardUi(taskId: string, storage?: StorageLike): TaskCardUiState {
  return loadTaskCardStates(storage)[taskId] ?? {}
}

export function writeTaskCardUi(taskId: string, state: TaskCardUiState, storage?: StorageLike): void {
  const target = storage ?? browserStorage()
  if (target === undefined) return
  try {
    target.setItem(TASK_CARD_STATE_STORAGE_KEY, JSON.stringify(setTaskCardUi(loadTaskCardStates(target), taskId, state)))
  } catch {
    return
  }
}
