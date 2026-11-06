/** Board-only view types and pure lane ordering. */

import type { DeskTask, TaskStatus } from '../../contract.js'
import { sortTasks } from '../../model.js'

export const TASK_LANE_ORDER: readonly TaskStatus[] = ['todo', 'doing', 'done']

export type TaskSortMode = 'manual' | 'created' | 'due'

export type TaskLanes = Readonly<Record<TaskStatus, readonly DeskTask[]>>

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

/** Group non-archived tasks into the three fixed lanes using the given view mode. */
export function groupLanes(tasks: readonly DeskTask[], mode: TaskSortMode): TaskLanes {
  const active = tasks.filter(task => !task.archived)
  return {
    todo: sortLane(active.filter(task => task.status === 'todo'), mode),
    doing: sortLane(active.filter(task => task.status === 'doing'), mode),
    done: sortLane(active.filter(task => task.status === 'done'), mode),
  }
}
