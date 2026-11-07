/**
 * Board state on top of tasks + first-class groups.
 *
 * A lane is ONE manual sequence of blocks: ungrouped cards and group blocks share the same
 * `order` coordinate. Legacy boards kept two separate order spaces; until the first structural
 * drag renumbers a lane, the view falls back to "cards first, then groups" (see manualBlocks).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { TASK_GROUP_COLLAPSE_STORAGE_KEY, TASK_GROUPS_STORAGE_KEY, TASK_SORT_STORAGE_KEY } from '../../../constants.js'
import type { CreateTaskGroupRequest, CreateTaskRequest, DeskTask, DeskTaskGroup, TaskPatchRequest, TaskStatus } from '../../../contract.js'
import { sortTasks } from '../../../model.js'
import { groupLanes, manualBlocks, type LaneBlock, type LaneViews, type TaskSortMode } from '../types.js'

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
  readonly setGroupOrders: (entries: readonly { group: DeskTaskGroup; order: number }[]) => void
  readonly removeGroup: (group: DeskTaskGroup) => void
  readonly moveGroupToLane: (group: DeskTaskGroup, status: TaskStatus, order?: number) => Promise<{
    group: DeskTaskGroup
    tasks: readonly DeskTask[]
    groups: readonly DeskTaskGroup[]
  } | null>
  readonly archiveGroup: (group: DeskTaskGroup, archived: boolean) => Promise<{
    group: DeskTaskGroup
    tasks: readonly DeskTask[]
  } | null>
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
  /** `toIndex` is a card index when `toGroupId` is set, otherwise a lane block index. */
  readonly moveTask: (taskId: string, toStatus: TaskStatus, toGroupId: string | undefined, toIndex: number) => void
  readonly archiveTask: (task: DeskTask) => void
  readonly restoreTask: (task: DeskTask) => void
  readonly deleteTask: (id: string) => void
  readonly isGroupCollapsed: (groupId: string) => boolean
  readonly toggleGroup: (groupId: string) => void
  readonly createGroup: (status: TaskStatus, name: string) => Promise<DeskTaskGroup | null>
  readonly renameGroup: (group: DeskTaskGroup, name: string) => void
  readonly removeGroup: (group: DeskTaskGroup) => void
  /** Move a whole group block to a block index in a lane (host cascades its cards cross-lane). */
  readonly moveGroupBlock: (group: DeskTaskGroup, status: TaskStatus, toIndex: number) => void
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
  groups, createGroup, renameGroup, setGroupOrders, removeGroup, moveGroupToLane, archiveGroup,
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

  const blocksFor = useCallback((status: TaskStatus): LaneBlock[] =>
    manualBlocks(tasks, activeGroups, status), [activeGroups, tasks])

  /** One optimistic task patch path for reorder / renumber / move operations. */
  const applyTaskPatches = useCallback((entries: readonly { source: DeskTask; patch: TaskPatchRequest }[]): void => {
    if (entries.length === 0) return
    const byId = new Map(entries.map(entry => [entry.source.id, entry.patch]))
    setTasks(current => current.map(task => {
      const patch = byId.get(task.id)
      return patch === undefined ? task : { ...task, ...patch } as DeskTask
    }))
    for (const entry of entries) savePatch(entry.source, entry.patch)
    setActionError(null)
  }, [savePatch, setActionError, setTasks])

  /** Persist a lane's block sequence: ungrouped cards and groups share the block index. */
  const applyBlockOrders = useCallback((
    blocks: readonly LaneBlock[],
    moving?: { readonly task: DeskTask; readonly patch: TaskPatchRequest },
  ): void => {
    const taskEntries: Array<{ source: DeskTask; patch: TaskPatchRequest }> = []
    const groupOrders: Array<{ group: DeskTaskGroup; order: number }> = []
    blocks.forEach((block, index) => {
      if (block.kind === 'task') {
        const isMoving = moving !== undefined && block.task.id === moving.task.id
        const patch: TaskPatchRequest = {
          ...block.task.order === index ? {} : { order: index },
          ...isMoving ? moving.patch : {},
        }
        if (Object.keys(patch).length > 0) taskEntries.push({ source: block.task, patch })
        return
      }
      if (block.group.order !== index) groupOrders.push({ group: block.group, order: index })
    })
    if (taskEntries.length === 0 && groupOrders.length === 0) return
    applyTaskPatches(taskEntries)
    if (groupOrders.length > 0) setGroupOrders(groupOrders)
  }, [applyTaskPatches, setGroupOrders])

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
    if (target.groupId === undefined) {
      // New ungrouped card becomes the last block of the lane.
      void addTask({ title: trimmed, status: target.status, order: blocksFor(target.status).length })
      return
    }
    const sameContainer = tasks.filter(task => task.status === target.status && task.groupId === target.groupId)
    const order = sameContainer.reduce((max, task) => Math.max(max, task.order), -1) + 1
    void addTask({ title: trimmed, status: target.status, order, groupId: target.groupId })
  }, [addTask, blocksFor, draft, tasks])

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
    return createGroup({ name: trimmed, status, order: blocksFor(status).length })
  }, [blocksFor, createGroup])

  const removeGroupAction = useCallback((group: DeskTaskGroup): void => {
    // Cards keep existing; only their membership is cleared.
    setTasks(current => current.map(task => task.groupId === group.id
      ? { ...task, groupId: undefined }
      : task))
    removeGroup(group)
  }, [removeGroup, setTasks])

  /** Move one card into a group's card list, or into the lane's block sequence. */
  const moveTask = useCallback((
    taskId: string,
    toStatus: TaskStatus,
    toGroupId: string | undefined,
    toIndex: number,
  ): void => {
    const moving = tasks.find(task => task.id === taskId)
    if (moving === undefined) return

    if (toGroupId !== undefined) {
      const target = sortTasks(tasks.filter(task =>
        task.id !== taskId
        && task.status === toStatus
        && task.groupId === toGroupId))
      const index = Math.max(0, Math.min(toIndex, target.length))
      target.splice(index, 0, moving)
      const taskEntries: Array<{ source: DeskTask; patch: TaskPatchRequest }> = []
      target.forEach((task, position) => {
        const isMoving = task.id === taskId
        const patch: TaskPatchRequest = {
          ...task.order === position ? {} : { order: position },
          ...isMoving && task.status !== toStatus ? { status: toStatus } : {},
          ...isMoving && task.groupId !== toGroupId ? { groupId: toGroupId } : {},
        }
        if (Object.keys(patch).length === 0) return
        taskEntries.push({ source: task, patch })
      })
      applyTaskPatches(taskEntries)
      return
    }

    // Ungrouped target: insert a card block into the shared lane sequence.
    const blocks = blocksFor(toStatus)
      .filter(block => !(block.kind === 'task' && block.task.id === taskId))
    const index = Math.max(0, Math.min(toIndex, blocks.length))
    blocks.splice(index, 0, { kind: 'task', task: moving })
    applyBlockOrders(blocks, {
      task: moving,
      patch: {
        ...moving.status === toStatus ? {} : { status: toStatus },
        ...moving.groupId === undefined ? {} : { groupId: null },
      },
    })
  }, [applyBlockOrders, blocksFor, savePatch, setActionError, setTasks, tasks])

  /** Move a group block within the unified lane sequence (same lane) or across lanes. */
  const moveGroupBlock = useCallback((group: DeskTaskGroup, status: TaskStatus, toIndex: number): void => {
    if (status === group.status) {
      const blocks = blocksFor(status)
        .filter(block => !(block.kind === 'group' && block.group.id === group.id))
      const index = Math.max(0, Math.min(toIndex, blocks.length))
      blocks.splice(index, 0, {
        kind: 'group',
        group,
        tasks: sortTasks(tasks.filter(task => task.groupId === group.id)),
      })
      applyBlockOrders(blocks)
      return
    }

    void (async () => {
      const result = await moveGroupToLane(group, status, toIndex)
      if (result === null) return
      const byId = new Map(result.tasks.map(task => [task.id, task]))
      const updatedTasks = tasks.map(task => byId.get(task.id) ?? task)
      setTasks(updatedTasks)
      const updatedGroups = result.groups.filter(candidate => !candidate.archived)

      const targetBlocks = manualBlocks(updatedTasks, updatedGroups, status)
        .filter(block => !(block.kind === 'group' && block.group.id === group.id))
      const targetIndex = Math.max(0, Math.min(toIndex, targetBlocks.length))
      targetBlocks.splice(targetIndex, 0, {
        kind: 'group',
        group: result.group,
        tasks: sortTasks(updatedTasks.filter(task => task.groupId === group.id)),
      })
      applyBlockOrders(targetBlocks)

      // Close the gap the moved group left in its old lane.
      applyBlockOrders(manualBlocks(updatedTasks, updatedGroups, group.status))
    })()
  }, [applyBlockOrders, blocksFor, moveGroupToLane, setTasks, tasks])

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
    moveGroupBlock, archiveGroup: archiveGroupAction,
  }
}
