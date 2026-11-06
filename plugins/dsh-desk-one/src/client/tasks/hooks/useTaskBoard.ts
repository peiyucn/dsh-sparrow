/**
 * Board state on top of the task collection: view mode, done-column collapse, one-level groups,
 * archive view, draft cards, and the move/reorder operation that keeps manual `order` consistent.
 *
 * Groups are UI-managed: the task's `group` field is the single source of truth for membership;
 * the per-lane group name list + collapse flags are localStorage preferences.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  TASK_GROUP_COLLAPSE_STORAGE_KEY, TASK_GROUPS_STORAGE_KEY, TASK_SORT_STORAGE_KEY,
} from '../../../constants.js'
import type { CreateTaskRequest, DeskTask, TaskPatchRequest, TaskStatus } from '../../../contract.js'
import { groupLanes, laneSequence, TASK_LANE_ORDER, type GroupOrder, type LaneViews, type TaskSortMode } from '../types.js'

interface BoardDeps {
  readonly tasks: readonly DeskTask[]
  readonly setTasks: Dispatch<SetStateAction<readonly DeskTask[]>>
  readonly savePatch: (task: DeskTask, patch: TaskPatchRequest) => void
  readonly addTask: (input: CreateTaskRequest) => Promise<DeskTask | null>
  readonly removeWithFeedback: (id: string) => void
  readonly setActionError: (message: string | null) => void
}

export interface TaskDraft {
  readonly status: TaskStatus
  readonly group?: string
}

export interface TaskBoardApi {
  readonly lanes: LaneViews
  readonly archivedTasks: readonly DeskTask[]
  readonly sortMode: TaskSortMode
  readonly setSortMode: (mode: TaskSortMode) => void
  readonly doneCollapsed: boolean
  readonly toggleDone: () => void
  readonly showArchive: boolean
  readonly toggleArchive: () => void
  readonly draft: TaskDraft | null
  readonly beginDraft: (status: TaskStatus, group?: string) => void
  readonly cancelDraft: () => void
  readonly commitDraft: (title: string) => void
  readonly moveTask: (taskId: string, toStatus: TaskStatus, toGroup: string | undefined, toIndex: number) => void
  readonly archiveTask: (task: DeskTask) => void
  readonly restoreTask: (task: DeskTask) => void
  readonly deleteTask: (id: string) => void
  readonly isGroupCollapsed: (status: TaskStatus, name: string) => boolean
  readonly toggleGroup: (status: TaskStatus, name: string) => void
  readonly createGroup: (status: TaskStatus, name: string) => void
  readonly renameGroup: (status: TaskStatus, from: string, to: string) => void
  readonly removeGroup: (status: TaskStatus, name: string) => void
}

const emptyGroupOrder = (): GroupOrder => ({ todo: [], doing: [], done: [] })

function readSortMode(): TaskSortMode {
  try {
    const stored = window.localStorage.getItem(TASK_SORT_STORAGE_KEY)
    if (stored === 'manual' || stored === 'created' || stored === 'due') return stored
  } catch {
    // Storage unavailable: keep the default manual order.
  }
  return 'manual'
}

function readGroups(): GroupOrder {
  try {
    const raw = window.localStorage.getItem(TASK_GROUPS_STORAGE_KEY)
    if (raw === null) return emptyGroupOrder()
    const parsed = JSON.parse(raw) as Partial<Record<TaskStatus, unknown>>
    const clean = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
    return { todo: clean(parsed.todo), doing: clean(parsed.doing), done: clean(parsed.done) }
  } catch {
    return emptyGroupOrder()
  }
}

function readCollapsed(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(TASK_GROUP_COLLAPSE_STORAGE_KEY)
    if (raw === null) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const clean: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(parsed)) if (value === true) clean[key] = true
    return clean
  } catch {
    return {}
  }
}

function persist(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Pure UI preference: losing it is acceptable.
  }
}

export function useTaskBoard({
  tasks, setTasks, savePatch, addTask, removeWithFeedback, setActionError,
}: BoardDeps): TaskBoardApi {
  const [sortMode, setSortModeState] = useState<TaskSortMode>(readSortMode)
  const [doneCollapsed, setDoneCollapsed] = useState(false)
  const [showArchive, setShowArchive] = useState(false)
  const [draft, setDraft] = useState<TaskDraft | null>(null)
  const [groups, setGroups] = useState<GroupOrder>(readGroups)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(readCollapsed)

  // Keep the stored group list in sync with group names that only exist on tasks (agent / other UI).
  useEffect(() => {
    setGroups((current) => {
      let changed = false
      const next: Record<TaskStatus, string[]> = { todo: [...current.todo], doing: [...current.doing], done: [...current.done] }
      for (const task of tasks) {
        if (task.archived || task.group === undefined) continue
        if (!next[task.status].includes(task.group)) {
          next[task.status].push(task.group)
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [tasks])

  const lanes = useMemo(() => groupLanes(tasks, sortMode, groups), [tasks, sortMode, groups])
  const archivedTasks = useMemo(() => tasks.filter(task => task.archived), [tasks])

  const setSortMode = useCallback((mode: TaskSortMode): void => {
    setSortModeState(mode)
    persist(TASK_SORT_STORAGE_KEY, mode)
  }, [])

  const toggleDone = useCallback((): void => setDoneCollapsed(value => !value), [])
  const toggleArchive = useCallback((): void => setShowArchive(value => !value), [])
  const beginDraft = useCallback((status: TaskStatus, group?: string): void => setDraft({ status, group }), [])
  const cancelDraft = useCallback((): void => setDraft(null), [])

  const commitDraft = useCallback((title: string): void => {
    const target = draft
    setDraft(null)
    if (target === null) return
    const trimmed = title.trim()
    if (trimmed === '') return
    // New cards go to the end of the lane's manual order regardless of the current view mode.
    const lane = laneSequence(lanes[target.status])
    const order = lane.reduce((max, task) => Math.max(max, task.order), -1) + 1
    void addTask({
      title: trimmed,
      status: target.status,
      order,
      ...target.group === undefined ? {} : { group: target.group },
    })
  }, [addTask, draft, lanes])

  const archiveTask = useCallback((task: DeskTask): void => {
    setTasks(current => current.map(item => item.id === task.id ? { ...item, archived: true } : item))
    savePatch(task, { archived: true })
  }, [savePatch, setTasks])

  const restoreTask = useCallback((task: DeskTask): void => {
    setTasks(current => current.map(item => item.id === task.id ? { ...item, archived: false } : item))
    savePatch(task, { archived: false })
  }, [savePatch, setTasks])

  const deleteTask = useCallback((id: string): void => removeWithFeedback(id), [removeWithFeedback])

  const isGroupCollapsed = useCallback(
    (status: TaskStatus, name: string): boolean => collapsedGroups[`${status}:${name}`] === true,
    [collapsedGroups],
  )

  const toggleGroup = useCallback((status: TaskStatus, name: string): void => {
    setCollapsedGroups((current) => {
      const key = `${status}:${name}`
      const next = { ...current }
      if (next[key]) delete next[key]
      else next[key] = true
      persist(TASK_GROUP_COLLAPSE_STORAGE_KEY, next)
      return next
    })
  }, [])

  const createGroup = useCallback((status: TaskStatus, name: string): void => {
    const trimmed = name.trim()
    if (trimmed === '') return
    setGroups((current) => {
      if (current[status].includes(trimmed)) return current
      const next = { ...current, [status]: [...current[status], trimmed] }
      persist(TASK_GROUPS_STORAGE_KEY, next)
      return next
    })
  }, [])

  const renameGroup = useCallback((status: TaskStatus, from: string, to: string): void => {
    const trimmed = to.trim()
    if (trimmed === '' || trimmed === from) return
    setGroups((current) => {
      const next = { ...current, [status]: current[status].map(name => name === from ? trimmed : name) }
      persist(TASK_GROUPS_STORAGE_KEY, next)
      return next
    })
    // Membership lives on the tasks: rename means patching every card in the group.
    for (const task of tasks) {
      if (task.status === status && task.group === from) savePatch(task, { group: trimmed })
    }
    setCollapsedGroups((current) => {
      const key = `${status}:${from}`
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      next[`${status}:${trimmed}`] = true
      persist(TASK_GROUP_COLLAPSE_STORAGE_KEY, next)
      return next
    })
  }, [savePatch, tasks])

  const removeGroup = useCallback((status: TaskStatus, name: string): void => {
    setGroups((current) => {
      const next = { ...current, [status]: current[status].filter(item => item !== name) }
      persist(TASK_GROUPS_STORAGE_KEY, next)
      return next
    })
    for (const task of tasks) {
      if (task.status === status && task.group === name) savePatch(task, { group: null })
    }
  }, [savePatch, tasks])

  /**
   * Move a task to (lane, group, index). Rebuilds the affected lanes' rendered sequence, assigns
   * sequential `order` values and patches only tasks whose order / status / group changed.
   */
  const moveTask = useCallback((taskId: string, toStatus: TaskStatus, toGroup: string | undefined, toIndex: number): void => {
    const moving = tasks.find(task => task.id === taskId)
    if (moving === undefined) return

    const sequences: Record<TaskStatus, DeskTask[]> = {
      todo: [...laneSequence(lanes.todo)],
      doing: [...laneSequence(lanes.doing)],
      done: [...laneSequence(lanes.done)],
    }
    const source = sequences[moving.status]
    const sourceIndex = source.findIndex(task => task.id === taskId)
    if (sourceIndex === -1) return
    source.splice(sourceIndex, 1)

    const target = sequences[toStatus]
    const anchor = target.filter(task => (task.group ?? undefined) === (toGroup ?? undefined) && task.id !== taskId)
    const insertAt = Math.max(0, Math.min(toIndex, anchor.length))
    if (anchor.length === 0) {
      // Empty group: append at the end of the lane, which keeps group blocks contiguous.
      target.push(moving)
    } else if (insertAt === anchor.length) {
      target.splice(target.indexOf(anchor[anchor.length - 1]) + 1, 0, moving)
    } else {
      target.splice(target.indexOf(anchor[insertAt]), 0, moving)
    }

    const patches: Array<{ task: DeskTask; patch: TaskPatchRequest }> = []
    const touched: DeskTask[] = []
    for (const status of TASK_LANE_ORDER) {
      for (const [order, task] of sequences[status].entries()) {
        const statusChanged = task.id === taskId && status !== moving.status
        const groupChanged = task.id === taskId && (task.group ?? undefined) !== toGroup
        const orderChanged = task.order !== order || statusChanged
        if (!statusChanged && !groupChanged && !orderChanged) continue
        patches.push({
          task,
          patch: {
            ...order === task.order ? {} : { order },
            ...statusChanged ? { status } : {},
            ...groupChanged ? { group: toGroup ?? null } : {},
          },
        })
        touched.push(task)
      }
    }
    // The moving task may end up with the same order in the same lane but a different group;
    // ensure its group patch is included even if neither order nor status changed.
    if (patches.length === 0 && (moving.group ?? undefined) !== toGroup) {
      patches.push({ task: moving, patch: { group: toGroup ?? null } })
      touched.push(moving)
    }
    if (patches.length === 0) return

    const patchById = new Map(patches.map(entry => [entry.task.id, entry.patch]))
    setTasks(current => current.map(task => {
      const patch = patchById.get(task.id)
      return patch === undefined ? task : { ...task, ...patch } as DeskTask
    }))
    for (const entry of patches) savePatch(entry.task, entry.patch)
    setActionError(null)
  }, [lanes, savePatch, setActionError, setTasks, tasks])

  return {
    lanes, archivedTasks, sortMode, setSortMode, doneCollapsed, toggleDone,
    showArchive, toggleArchive, draft, beginDraft, cancelDraft, commitDraft,
    moveTask, archiveTask, restoreTask, deleteTask,
    isGroupCollapsed, toggleGroup, createGroup, renameGroup, removeGroup,
  }
}
