/** Board-only view types: a lane is ONE ordered sequence of blocks (ungrouped cards + groups). */

import type { DeskTask, DeskTaskGroup, TaskStatus } from '../../contract.js'
import { sortGroups, sortTasks } from '../../model.js'

export const TASK_LANE_ORDER: readonly TaskStatus[] = ['todo', 'doing', 'done']

export type TaskSortMode = 'manual' | 'created' | 'due'

interface LaneGroup {
  readonly group: DeskTaskGroup
  readonly tasks: readonly DeskTask[]
}

/** One top-level item in a lane: a single ungrouped card, or one group block with its cards. */
export type LaneBlock =
  | { readonly kind: 'task'; readonly task: DeskTask }
  | { readonly kind: 'group'; readonly group: DeskTaskGroup; readonly tasks: readonly DeskTask[] }

/** One lane as rendered: ungrouped cards and group blocks share a single manual sequence. */
export interface LaneView {
  readonly ungrouped: readonly DeskTask[]
  readonly groups: readonly LaneGroup[]
  readonly blocks: readonly LaneBlock[]
}

export type LaneViews = Readonly<Record<TaskStatus, LaneView>>

interface LaneParts {
  readonly ungrouped: readonly DeskTask[]
  readonly groups: readonly LaneGroup[]
  readonly taskBlocks: readonly LaneBlock[]
  readonly groupBlocks: readonly LaneBlock[]
  /** True when the two legacy order spaces are disjoint enough to merge into one exact sequence. */
  readonly unified: boolean
}

/**
 * Ordering inside one container (a group's card list). Manual is the persisted `order`; the other
 * modes are view-only overrides that never write back.
 */
export function sortContainer(tasks: readonly DeskTask[], mode: TaskSortMode): DeskTask[] {
  if (mode === 'manual') return sortTasks(tasks)
  if (mode === 'created') return [...tasks].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
  return [...tasks].sort((left, right) => {
    const leftDue = left.due?.date ?? '9999-12-31'
    const rightDue = right.due?.date ?? '9999-12-31'
    return leftDue.localeCompare(rightDue) || left.order - right.order || left.id.localeCompare(right.id)
  })
}

function blockOrder(block: LaneBlock): number {
  return block.kind === 'group' ? block.group.order : block.task.order
}

/**
 * Legacy boards kept separate order spaces for ungrouped cards and groups. Only disjoint values
 * can be merged exactly; otherwise the lane renders "cards first, then groups" until its first
 * structural drag renumbers every block.
 */
function hasUnifiedOrder(blocks: readonly LaneBlock[]): boolean {
  const seen = new Set<number>()
  for (const block of blocks) {
    const order = blockOrder(block)
    if (seen.has(order)) return false
    seen.add(order)
  }
  return true
}

function orderedBlocks(parts: LaneParts, mode: TaskSortMode): LaneBlock[] {
  const merged = [...parts.taskBlocks, ...parts.groupBlocks]
  if (mode !== 'manual' || !parts.unified) return merged
  return merged.sort((left, right) => blockOrder(left) - blockOrder(right))
}

/** Single lane builder shared by rendering and drag/insert math. */
function laneParts(
  tasks: readonly DeskTask[],
  groups: readonly DeskTaskGroup[],
  status: TaskStatus,
  mode: TaskSortMode,
): LaneParts {
  const laneTasks = tasks.filter(task => !task.archived && task.status === status)
  const known = new Set(groups.map(group => group.id))
  const ungrouped = sortContainer(
    laneTasks.filter(task => task.groupId === undefined || !known.has(task.groupId)),
    mode,
  )
  const groupsInLane = sortGroups(groups.filter(group => group.status === status && !group.archived))
  const laneGroups: LaneGroup[] = groupsInLane.map(group => ({
    group,
    tasks: sortContainer(laneTasks.filter(task => task.groupId === group.id), mode),
  }))
  const taskBlocks: LaneBlock[] = ungrouped.map(task => ({ kind: 'task', task }))
  const groupBlocks: LaneBlock[] = laneGroups.map(group => ({
    kind: 'group',
    group: group.group,
    tasks: group.tasks,
  }))
  return {
    ungrouped,
    groups: laneGroups,
    taskBlocks,
    groupBlocks,
    unified: mode === 'manual' && hasUnifiedOrder([...taskBlocks, ...groupBlocks]),
  }
}

/**
 * Manual block sequence used for drag/insert math, regardless of the current sort view: ungrouped
 * cards first when the lane still has legacy split order spaces, otherwise sorted by block order.
 */
export function manualBlocks(
  tasks: readonly DeskTask[],
  groups: readonly DeskTaskGroup[],
  status: TaskStatus,
): LaneBlock[] {
  return orderedBlocks(laneParts(tasks, groups, status, 'manual'), 'manual')
}

/** Build one lane's view; non-manual sort modes keep the legacy (cards then groups) layout. */
function buildLane(
  tasks: readonly DeskTask[],
  groups: readonly DeskTaskGroup[],
  status: TaskStatus,
  mode: TaskSortMode,
): LaneView {
  const parts = laneParts(tasks, groups, status, mode)
  return {
    ungrouped: parts.ungrouped,
    groups: parts.groups,
    blocks: orderedBlocks(parts, mode),
  }
}

/** Group all non-archived tasks into the three fixed lanes, with one manual block sequence each. */
export function groupLanes(
  tasks: readonly DeskTask[],
  groups: readonly DeskTaskGroup[],
  mode: TaskSortMode,
): LaneViews {
  return {
    todo: buildLane(tasks, groups, 'todo', mode),
    doing: buildLane(tasks, groups, 'doing', mode),
    done: buildLane(tasks, groups, 'done', mode),
  }
}
