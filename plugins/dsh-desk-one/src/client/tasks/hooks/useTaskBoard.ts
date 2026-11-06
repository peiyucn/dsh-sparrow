/**
 * Board state on top of the task collection: view mode, done-column collapse, archive view,
 * draft cards, and the move/reorder operation that keeps manual `order` consistent.
 */

import { useCallback, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { TASK_SORT_STORAGE_KEY } from '../../../constants.js'
import type { CreateTaskRequest, DeskTask, TaskPatchRequest, TaskStatus } from '../../../contract.js'
import type { DeskTranslator } from '../../app/types.js'
import { groupLanes, type TaskLanes, type TaskSortMode } from '../types.js'

interface BoardDeps {
  readonly tasks: readonly DeskTask[]
  readonly setTasks: Dispatch<SetStateAction<readonly DeskTask[]>>
  readonly savePatch: (task: DeskTask, patch: TaskPatchRequest) => void
  readonly addTask: (input: CreateTaskRequest) => Promise<DeskTask | null>
  readonly removeWithFeedback: (id: string) => void
  readonly setActionError: (message: string | null) => void
  readonly t: DeskTranslator
}

export interface TaskBoardApi {
  readonly lanes: TaskLanes
  readonly archivedTasks: readonly DeskTask[]
  readonly sortMode: TaskSortMode
  readonly setSortMode: (mode: TaskSortMode) => void
  readonly doneCollapsed: boolean
  readonly toggleDone: () => void
  readonly showArchive: boolean
  readonly toggleArchive: () => void
  readonly draftLane: TaskStatus | null
  readonly beginDraft: (status: TaskStatus) => void
  readonly cancelDraft: () => void
  readonly commitDraft: (status: TaskStatus, title: string) => void
  readonly moveTask: (taskId: string, toStatus: TaskStatus, toIndex: number) => void
  readonly archiveTask: (task: DeskTask) => void
  readonly restoreTask: (task: DeskTask) => void
  readonly deleteTask: (id: string) => void
}

function readSortMode(): TaskSortMode {
  try {
    const stored = window.localStorage.getItem(TASK_SORT_STORAGE_KEY)
    if (stored === 'manual' || stored === 'created' || stored === 'due') return stored
  } catch {
    // Storage unavailable: keep the default manual order.
  }
  return 'manual'
}

export function useTaskBoard({
  tasks, setTasks, savePatch, addTask, removeWithFeedback, setActionError, t,
}: BoardDeps): TaskBoardApi {
  const [sortMode, setSortModeState] = useState<TaskSortMode>(readSortMode)
  const [doneCollapsed, setDoneCollapsed] = useState(false)
  const [showArchive, setShowArchive] = useState(false)
  const [draftLane, setDraftLane] = useState<TaskStatus | null>(null)

  const lanes = useMemo(() => groupLanes(tasks, sortMode), [tasks, sortMode])
  const archivedTasks = useMemo(() => tasks.filter(task => task.archived), [tasks])

  const setSortMode = useCallback((mode: TaskSortMode): void => {
    setSortModeState(mode)
    try {
      window.localStorage.setItem(TASK_SORT_STORAGE_KEY, mode)
    } catch {
      // Non-persistent preference is still usable for this session.
    }
  }, [])

  const toggleDone = useCallback((): void => setDoneCollapsed(value => !value), [])
  const toggleArchive = useCallback((): void => setShowArchive(value => !value), [])
  const beginDraft = useCallback((status: TaskStatus): void => setDraftLane(status), [])
  const cancelDraft = useCallback((): void => setDraftLane(null), [])

  const commitDraft = useCallback((status: TaskStatus, title: string): void => {
    const trimmed = title.trim()
    setDraftLane(null)
    if (trimmed === '') return
    const lane = lanes[status]
    // New cards go to the end of the lane's manual order regardless of the current view mode.
    const order = lane.reduce((max, task) => Math.max(max, task.order), -1) + 1
    void addTask({ title: trimmed, status, order })
  }, [addTask, lanes])

  const archiveTask = useCallback((task: DeskTask): void => {
    setTasks(current => current.map(item => item.id === task.id ? { ...item, archived: true } : item))
    savePatch(task, { archived: true })
  }, [savePatch, setTasks])

  const restoreTask = useCallback((task: DeskTask): void => {
    setTasks(current => current.map(item => item.id === task.id ? { ...item, archived: false } : item))
    savePatch(task, { archived: false })
  }, [savePatch, setTasks])

  const deleteTask = useCallback((id: string): void => removeWithFeedback(id), [removeWithFeedback])

  /**
   * Move a task to a lane/index. Reassigns sequential `order` values for the affected lanes and
   * patches only tasks whose order (or status) actually changed.
   */
  const moveTask = useCallback((taskId: string, toStatus: TaskStatus, toIndex: number): void => {
    const moving = tasks.find(task => task.id === taskId)
    if (moving === undefined) return
    const byStatus: Record<TaskStatus, DeskTask[]> = {
      todo: [...lanes.todo],
      doing: [...lanes.doing],
      done: [...lanes.done],
    }
    const source = byStatus[moving.status]
    const sourceIndex = source.findIndex(task => task.id === taskId)
    if (sourceIndex === -1) return
    source.splice(sourceIndex, 1)
    const target = byStatus[toStatus]
    const index = Math.max(0, Math.min(toIndex, target.length))
    target.splice(index, 0, moving)

    const patches: Array<{ task: DeskTask; patch: TaskPatchRequest }> = []
    for (const status of Object.keys(byStatus) as TaskStatus[]) {
      for (const [order, task] of byStatus[status].entries()) {
        const statusChanged = task.id === taskId && status !== moving.status
        const orderChanged = task.order !== order || statusChanged
        if (!orderChanged) continue
        patches.push({ task, patch: { order, ...statusChanged ? { status } : {} } })
      }
    }
    if (patches.length === 0) return

    // Optimistic local update first; the per-task write chain persists each change.
    const patchById = new Map(patches.map(entry => [entry.task.id, entry.patch]))
    setTasks(current => current.map(task => {
      const patch = patchById.get(task.id)
      return patch === undefined ? task : { ...task, ...patch } as DeskTask
    }))
    for (const entry of patches) savePatch(entry.task, entry.patch)
    setActionError(null)
  }, [lanes, savePatch, setActionError, setTasks, t, tasks])

  return {
    lanes, archivedTasks, sortMode, setSortMode, doneCollapsed, toggleDone,
    showArchive, toggleArchive, draftLane, beginDraft, cancelDraft, commitDraft,
    moveTask, archiveTask, restoreTask, deleteTask,
  }
}
