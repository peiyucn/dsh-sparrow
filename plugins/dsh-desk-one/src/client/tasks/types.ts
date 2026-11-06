/** Board-only view types: lanes contain ungrouped cards plus first-class groups. */

import type { DeskTask, DeskTaskGroup, TaskStatus } from '../../contract.js'
import { sortGroups, sortTasks } from '../../model.js'

export const TASK_LANE_ORDER: readonly TaskStatus[] = ['todo', 'doing', 'done']

export type TaskSortMode = 'manual' | 'created' | 'due'

export interface LaneGroup {
  readonly group: DeskTaskGroup
  readonly tasks: readonly DeskTask[]
}

/** One lane as rendered: ungrouped cards first, then groups in their persisted order. */
export interface LaneView {
  readonly ungrouped: readonly DeskTask[]
  readonly groups: readonly LaneGroup[]
}

export type LaneViews = Readonly<Record<TaskStatus, LaneView>>

/**
 * Ordering inside one container. Manual is the persisted `order`; the other modes are view-only
 * overrides that never write back.
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

/**
 * Group every non-archived task into its lane/group container. Groups are a host-side list, so
 * empty groups render too; unknown membership (stale id) falls back to the ungrouped area.
 */
export function groupLanes(
  tasks: readonly DeskTask[],
  groups: readonly DeskTaskGroup[],
  mode: TaskSortMode,
): LaneViews {
  const active = tasks.filter(task => !task.archived)
  const known = new Set(groups.map(group => group.id))
  const build = (status: TaskStatus): LaneView => {
    const laneTasks = active.filter(task => task.status === status)
    const orderedGroups = sortGroups(groups.filter(group => group.status === status))
    return {
      ungrouped: sortContainer(laneTasks.filter(task => task.groupId === undefined || !known.has(task.groupId)), mode),
      groups: orderedGroups.map(group => ({
        group,
        tasks: sortContainer(laneTasks.filter(task => task.groupId === group.id), mode),
      })),
    }
  }
  return { todo: build('todo'), doing: build('doing'), done: build('done') }
}

/** Flatten one rendered lane into the order used for manual renumbering. */
export function laneSequence(lane: LaneView): DeskTask[] {
  return [...lane.ungrouped, ...lane.groups.flatMap(group => [...group.tasks])]
}
