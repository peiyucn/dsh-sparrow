/**
 * Board state on top of tasks + first-class groups.
 *
 * Ordering is per container (ungrouped area or one group), so dragging a card renumbers only its
 * target container and dragging a group never touches task orders. Cross-lane group moves are
 * executed by the caller after confirmation and cascade the lane status host-side.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { TASK_GROUP_COLLAPSE_STORAGE_KEY, TASK_GROUPS_STORAGE_KEY, TASK_SORT_STORAGE_KEY } from '../../../constants.js'
import type { CreateTaskGroupRequest, CreateTaskRequest, DeskTask, DeskTaskGroup, TaskPatchRequest, TaskStatus } from '../../../contract.js'
import { sortGroups, sortTasks } from '../../../model.js'
import { groupLanes, type LaneViews, type TaskSortMode } from '../types.js'

interface BoardDeps {
  readonly tasks: readonly DeskTask[]
  readonly setTasks: Dispatch<SetStateAction<readonly DeskTask[]>>
  readonly savePatch: (task: DeskTask, patch: TaskPatchRequest) => void
  readonly addTask: (input: CreateTaskRequest) => Promise<DeskTask | null>
  readonly removeWithFeedback: (id: string) => void
  readonly setActionError: (message: string | null) => void
  readonly groups: readonly DeskTaskGroup[]
  readonly createGroup: (input: CreateTaskGroupRequest) => Promise<DeskTaskGroup | null>
  readonly renameGroup: (group: DeskTaskGroup, name: string) => void
  readonly reorderGroups: (status: TaskStatus, ordered: readonly DeskTaskGroup[]) => void
  readonly removeGroup: (group: DeskTaskGroup) => void
  readonly moveGroupToLane: (group: DeskTaskGroup, status: TaskStatus, order?: number) => Promise<{
    group: DeskTaskGroup
    tasks: readonly DeskTask[]
  } | null>
  readonly archiveGroup: (group: DeskTaskGroup, archived: boolean) => Promise<{
    group: DeskTaskGroup
    tasks: readonly DeskTask[]
  } | null>
  readonly reloadGroups: () => Promise<void>
}

export interface TaskDraft {
  readonly status: TaskStatus
  readonly groupId?: string
}

export interface GroupMoveResult {
  readonly group: DeskTaskGroup
  readonly tasks: readonly DeskTask[]
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
  readonly beginDraft: (status: TaskStatus, groupId?: string) => void
  readonly cancelDraft: () => void
  readonly commitDraft: (title: string) => void
  readonly moveTask: (taskId: string, toStatus: TaskStatus, toGroupId: string | undefined, toIndex: number) => void
  readonly archiveTask: (task: DeskTask) => void
  readonly restoreTask: (task: DeskTask) => void
  readonly deleteTask: (id: string) => void
  readonly isGroupCollapsed: (groupId: string) => boolean
  readonly toggleGroup: (groupId: string) => void
  readonly createGroup: (status: TaskStatus, name: string) => Promise<DeskTaskGroup | null>
  readonly renameGroup: (group: DeskTaskGroup, name: string) => void
  readonly removeGroup: (group: DeskTaskGroup) => void
  readonly reorderGroup: (status: TaskStatus, groupId: string, toIndex: number) => void
  readonly moveGroupWhole: (group: DeskTaskGroup, status: TaskStatus, order?: number) => Promise<GroupMoveResult | null>
  /** Archive / restore a group and update its cards' archived flag from the host result. */
  readonly archiveGroup: (group: DeskTaskGroup, archived: boolean) => Promise<GroupMoveResult | null>
  readonly archivedGroups: readonly DeskTaskGroup[]
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
  groups, createGroup, renameGroup, reorderGroups, removeGroup, moveGroupToLane, archiveGroup, reloadGroups,
}: BoardDeps): TaskBoardApi {
  const [sortMode, setSortModeState] = useState<TaskSortMode>(readSortMode)
  const [doneCollapsed, setDoneCollapsed] = useState(false)
  const [showArchive, setShowArchive] = useState(false)
  const [draft, setDraft] = useState<TaskDraft | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(readCollapsed)

  // Group metadata now lives on the host; drop the pre-refactor localStorage leftovers once.
  useEffect(() => {
    try {
      window.localStorage.removeItem(TASK_GROUPS_STORAGE_KEY)
    } catch {
      // Nothing to migrate when storage is unavailable.
    }
  }, [])

  const activeGroups = useMemo(() => groups.filter(group => !group.archived), [groups])
  const lanes = useMemo(() => groupLanes(tasks, activeGroups, sortMode), [activeGroups, tasks, sortMode])
  const archivedTasks = useMemo(() => tasks.filter(task => task.archived), [tasks])
  const archivedGroups = useMemo(() => [...groups.filter(group => group.archived)].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id)), [groups])

  const setSortMode = useCallback((mode: TaskSortMode): void => {
    setSortModeState(mode)
    persist(TASK_SORT_STORAGE_KEY, mode)
  }, [])

  const toggleDone = useCallback((): void => setDoneCollapsed(value => !value), [])
  const toggleArchive = useCallback((): void => setShowArchive(value => !value), [])
  const beginDraft = useCallback((status: TaskStatus, groupId?: string): void => setDraft({ status, groupId }), [])
  const cancelDraft = useCallback((): void => setDraft(null), [])

  const commitDraft = useCallback((title: string): void => {
    const target = draft
    setDraft(null)
    if (target === null) return
    const trimmed = title.trim()
    if (trimmed === '') return
    const sameContainer = tasks.filter(task =>
      task.status === target.status && (task.groupId ?? undefined) === target.groupId)
    const order = sameContainer.reduce((max, task) => Math.max(max, task.order), -1) + 1
    void addTask({
      title: trimmed,
      status: target.status,
      order,
      ...target.groupId === undefined ? {} : { groupId: target.groupId },
    })
  }, [addTask, draft, tasks])

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
    (groupId: string): boolean => collapsedGroups[groupId] === true,
    [collapsedGroups],
  )

  const toggleGroup = useCallback((groupId: string): void => {
    setCollapsedGroups((current) => {
      const next = { ...current }
      if (next[groupId]) delete next[groupId]
      else next[groupId] = true
      persist(TASK_GROUP_COLLAPSE_STORAGE_KEY, next)
      return next
    })
  }, [])

  const createGroupAction = useCallback((status: TaskStatus, name: string): Promise<DeskTaskGroup | null> => {
    const trimmed = name.trim()
    if (trimmed === '') return Promise.resolve(null)
    const order = groups.filter(group => group.status === status && !group.archived).length
    return createGroup({ name: trimmed, status, order })
  }, [createGroup, groups])

  const removeGroupAction = useCallback((group: DeskTaskGroup): void => {
    // Cards keep existing; only their membership is cleared.
    setTasks(current => current.map(task => task.groupId === group.id
      ? { ...task, groupId: undefined }
      : task))
    removeGroup(group)
  }, [removeGroup, setTasks])

  /** Same-lane group reorder: only active groups participate in the visible ordering. */
  const reorderGroup = useCallback((status: TaskStatus, groupId: string, toIndex: number): void => {
    const laneGroups = sortGroups(groups.filter(group => group.status === status && !group.archived))
    const from = laneGroups.findIndex(group => group.id === groupId)
    if (from === -1) return
    const [moved] = laneGroups.splice(from, 1)
    if (moved === undefined) return
    laneGroups.splice(Math.max(0, Math.min(toIndex, laneGroups.length)), 0, moved)
    reorderGroups(status, laneGroups)
  }, [groups, reorderGroups])

  const moveGroupWhole = useCallback(async (
    group: DeskTaskGroup,
    status: TaskStatus,
    order?: number,
  ): Promise<GroupMoveResult | null> => {
    const result = await moveGroupToLane(group, status, order)
    if (result === null) return null
    const byId = new Map(result.tasks.map(task => [task.id, task]))
    setTasks(current => current.map(task => byId.get(task.id) ?? task))
    // Other groups' orders may have shifted in both lanes; pull the authoritative list.
    void reloadGroups()
    return result
  }, [moveGroupToLane, reloadGroups, setTasks])

  /**
   * Move one card into (lane, group, index). Only the target container is renumbered; the source
   * container keeps gaps, which is harmless because order is only compared per container.
   */
  const moveTask = useCallback((
    taskId: string,
    toStatus: TaskStatus,
    toGroupId: string | undefined,
    toIndex: number,
  ): void => {
    const moving = tasks.find(task => task.id === taskId)
    if (moving === undefined) return
    const target = sortTasks(tasks.filter(task =>
      task.id !== taskId
      && task.status === toStatus
      && (task.groupId ?? undefined) === toGroupId))
    const index = Math.max(0, Math.min(toIndex, target.length))
    target.splice(index, 0, moving)

    const patchById = new Map<string, TaskPatchRequest>()
    const sourceById = new Map<string, DeskTask>()
    target.forEach((task, position) => {
      const statusChanged = task.id === taskId && task.status !== toStatus
      const groupChanged = task.id === taskId && (task.groupId ?? undefined) !== toGroupId
      const orderChanged = task.order !== position
      if (!statusChanged && !groupChanged && !orderChanged) return
      patchById.set(task.id, {
        ...orderChanged ? { order: position } : {},
        ...statusChanged ? { status: toStatus } : {},
        ...groupChanged ? { groupId: toGroupId ?? null } : {},
      })
      sourceById.set(task.id, task)
    })
    if (patchById.size === 0) return

    setTasks(current => current.map(task => {
      const patch = patchById.get(task.id)
      return patch === undefined ? task : { ...task, ...patch } as DeskTask
    }))
    for (const [id, patch] of patchById) {
      const source = sourceById.get(id)
      if (source !== undefined) savePatch(source, patch)
    }
    setActionError(null)
  }, [savePatch, setActionError, setTasks, tasks])

  const archiveGroupAction = useCallback(async (
    group: DeskTaskGroup,
    archived: boolean,
  ): Promise<GroupMoveResult | null> => {
    const result = await archiveGroup(group, archived)
    if (result === null) return null
    const byId = new Map(result.tasks.map(task => [task.id, task]))
    setTasks(current => current.map(task => byId.get(task.id) ?? task))
    return result
  }, [archiveGroup, setTasks])

  return {
    lanes, archivedTasks, archivedGroups, sortMode, setSortMode, doneCollapsed, toggleDone,
    showArchive, toggleArchive, draft, beginDraft, cancelDraft, commitDraft,
    moveTask, archiveTask, restoreTask, deleteTask,
    isGroupCollapsed, toggleGroup,
    createGroup: createGroupAction, renameGroup, removeGroup: removeGroupAction,
    reorderGroup, moveGroupWhole, archiveGroup: archiveGroupAction,
  }
}
