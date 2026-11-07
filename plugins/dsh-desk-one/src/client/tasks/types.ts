/** Board-only view types: a lane is ONE ordered sequence of blocks (ungrouped cards + groups). */

import type { DeskTask, DeskTaskGroup, TaskStatus } from '../../contract.js'
import { sortGroups, sortTasks } from '../../model.js'

export const TASK_LANE_ORDER: readonly TaskStatus[] = ['todo', 'doing', 'done']

export type TaskSortMode = 'manual' | 'created' | 'due'

export interface LaneGroup {
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
 * True when ungrouped-card orders and group orders occupy disjoint values, which means the two
 * sets can be merged into one exact manual sequence. Legacy boards (separate order spaces) fail
 * this test until their first structural drag renumbers the lane.
 */
function hasUnifiedOrder(ungrouped: readonly LaneBlock[], groups: readonly LaneBlock[]): boolean {
  const seen = new Set<number>()
  for (const block of [...ungrouped, ...groups]) {
    const order = blockOrder(block)
    if (seen.has(order)) return false
    seen.add(order)
  }
  return true
}

function orderedBlocks(
  ungrouped: readonly LaneBlock[],
  groupBlocks: readonly LaneBlock[],
  unified: boolean,
): LaneBlock[] {
  if (!unified) return [...ungrouped, ...groupBlocks]
  return [...ungrouped, ...groupBlocks].sort((left, right) => blockOrder(left) - blockOrder(right))
}

/**
 * Manual block sequence used for drag/insert math: ungrouped cards first when the lane still has
 * legacy split order spaces, otherwise the merged sequence sorted by the shared block order.
 */
export function manualBlocks(
  tasks: readonly DeskTask[],
  groups: readonly DeskTaskGroup[],
  status: TaskStatus,
): LaneBlock[] {
  const laneTasks = tasks.filter(task => !task.archived && task.status === status)
  const known = new Set(groups.map(group => group.id))
  const ungrouped = sortTasks(laneTasks.filter(task => task.groupId === undefined || !known.has(task.groupId)))
    .map(task => ({ kind: 'task' as const, task }))
  const groupBlocks = sortGroups(groups.filter(group => group.status === status && !group.archived))
    .map(group => ({
      kind: 'group' as const,
      group,
      tasks: sortTasks(laneTasks.filter(task => task.groupId === group.id)),
    }))
  return orderedBlocks(ungrouped, groupBlocks, hasUnifiedOrder(ungrouped, groupBlocks))
}

/** Build one lane's view; non-manual sort modes keep the legacy (cards then groups) layout. */
function buildLane(
  tasks: readonly DeskTask[],
  groups: readonly DeskTaskGroup[],
  status: TaskStatus,
  mode: TaskSortMode,
): LaneView {
  const laneTasks = tasks.filter(task => !task.archived && task.status === status)
  const known = new Set(groups.map(group => group.id))
  const ungrouped = sortContainer(laneTasks.filter(task => task.groupId === undefined || !known.has(task.groupId)), mode)
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
    blocks: orderedBlocks(taskBlocks, groupBlocks, mode === 'manual' && hasUnifiedOrder(taskBlocks, groupBlocks)),
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
