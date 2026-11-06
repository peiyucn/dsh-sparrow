/** Board-only view types, lane ordering and one-level grouping. */

import type { DeskTask, TaskStatus } from '../../contract.js'
import { sortTasks } from '../../model.js'

export const TASK_LANE_ORDER: readonly TaskStatus[] = ['todo', 'doing', 'done']

export type TaskSortMode = 'manual' | 'created' | 'due'

export interface LaneGroup {
  readonly name: string
  readonly tasks: readonly DeskTask[]
}

/** One lane as rendered: ungrouped cards first, then the named groups in their stored order. */
export interface LaneView {
  readonly ungrouped: readonly DeskTask[]
  readonly groups: readonly LaneGroup[]
}

export type LaneViews = Readonly<Record<TaskStatus, LaneView>>
export type GroupOrder = Readonly<Record<TaskStatus, readonly string[]>>

/**
 * Lane order for a view mode. Manual is the persisted order; the other modes are view-only
 * overrides (they never write back to the tasks' `order`).
 */
export function sortLane(tasks: readonly DeskTask[], mode: TaskSortMode): DeskTask[] {
  if (mode === 'manual') return sortTasks(tasks)
  if (mode === 'created') return [...tasks].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
  return [...tasks].sort((left, right) => {
    const leftDue = left.due?.date ?? '9999-12-31'
    const rightDue = right.due?.date ?? '9999-12-31'
    return leftDue.localeCompare(rightDue) || left.order - right.order || left.id.localeCompare(right.id)
  })
}

/** Group one lane's tasks: ungrouped first, then groups in the stored order (unknown names last). */
function buildLane(tasks: readonly DeskTask[], mode: TaskSortMode, groups: readonly string[]): LaneView {
  const sorted = sortLane(tasks, mode)
  const ungrouped = sorted.filter(task => task.group === undefined)
  const names = [...groups]
  for (const task of sorted) {
    if (task.group !== undefined && !names.includes(task.group)) names.push(task.group)
  }
  return {
    ungrouped,
    groups: names
      .map(name => ({ name, tasks: sorted.filter(task => task.group === name) }))
      .filter(group => group.tasks.length > 0 || groups.includes(group.name)),
  }
}

/** Group all non-archived tasks into the three fixed lanes, applying the per-lane group order. */
export function groupLanes(
  tasks: readonly DeskTask[],
  mode: TaskSortMode,
  groupOrder: GroupOrder,
): LaneViews {
  const active = tasks.filter(task => !task.archived)
  return {
    todo: buildLane(active.filter(task => task.status === 'todo'), mode, groupOrder.todo),
    doing: buildLane(active.filter(task => task.status === 'doing'), mode, groupOrder.doing),
    done: buildLane(active.filter(task => task.status === 'done'), mode, groupOrder.done),
  }
}

/** Flatten a lane into its rendered card sequence (used to recompute `order` after a move). */
export function laneSequence(lane: LaneView): DeskTask[] {
  return [...lane.ungrouped, ...lane.groups.flatMap(group => [...group.tasks])]
}
