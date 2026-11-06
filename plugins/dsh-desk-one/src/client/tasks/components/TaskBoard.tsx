/**
 * Task board: toolbar, three lanes with first-class groups, pointer card drag (straight ghost),
 * HTML5 group drag (reorder within a lane; cross-lane asks for confirmation and can be undone),
 * double-click-to-add and the archive view.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react'
import { TASK_BOARD_COMPACT_WIDTH } from '../../../constants.js'
import type {
  CreateTaskGroupRequest, CreateTaskRequest, DeskTask, DeskTaskGroup, TaskGroupPatchRequest, TaskPatchRequest,
  TaskStatus,
} from '../../../contract.js'
import type { DeskTranslator } from '../../app/types.js'
import { TaskColumn, type DropTarget } from './TaskColumn.js'
import { useGroupsData } from '../hooks/useGroupsData.js'
import { useTaskBoard } from '../hooks/useTaskBoard.js'
import { useTasksData } from '../hooks/useTasksData.js'
import { TASK_LANE_ORDER, type TaskSortMode } from '../types.js'

export interface TaskBoardInjected {
  readonly listTasks: () => Promise<readonly DeskTask[]>
  readonly createTask: (input: CreateTaskRequest) => Promise<DeskTask>
  readonly updateTask: (input: { id: string; expectedRevision: number; patch: TaskPatchRequest }) => Promise<DeskTask>
  readonly deleteTask: (id: string) => Promise<void>
  readonly listGroups: () => Promise<readonly DeskTaskGroup[]>
  readonly createGroup: (input: CreateTaskGroupRequest) => Promise<DeskTaskGroup>
  readonly updateGroup: (input: {
    id: string
    expectedRevision: number
    patch: TaskGroupPatchRequest
  }) => Promise<DeskTaskGroup>
  readonly moveGroup: (input: {
    id: string
    expectedRevision: number
    status: string
    order?: number
  }) => Promise<{ group: DeskTaskGroup; tasks: readonly DeskTask[] }>
  readonly deleteGroup: (id: string) => Promise<void>
}

interface TaskBoardProps extends TaskBoardInjected {
  readonly t: DeskTranslator
}

/** Static locale keys per lane (the dictionary key type is a closed union). */
const LANE_LABEL_KEY = {
  todo: 'task.lane.todo',
  doing: 'task.lane.doing',
  done: 'task.lane.done',
} as const

/** Two-step delete row for the archive list (same pattern as the cards). */
function ArchiveRow({
  task, t, onRestore, onDelete,
}: {
  readonly task: DeskTask
  readonly t: DeskTranslator
  readonly onRestore: (task: DeskTask) => void
  readonly onDelete: (id: string) => void
}): ReactElement {
  const [confirm, setConfirm] = useState(false)
  return (
    <li className="dsh-task-archive-row">
      <span className="dsh-task-archive-dot" data-color={task.color} />
      <span className="dsh-task-archive-title">{task.title}</span>
      <span className="dsh-task-archive-lane">{t(LANE_LABEL_KEY[task.status])}</span>
      <button
        type="button"
        className="dsh-desk-iconbtn"
        aria-label={t('task.restore')}
        title={t('task.restore')}
        onClick={() => onRestore(task)}
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <path d="M4.5 6.5v4h4" />
          <path d="M5 10.3A5.2 5.2 0 1 1 6.6 13.2" />
        </svg>
      </button>
      <button
        type="button"
        className="dsh-desk-iconbtn dsh-desk-iconbtn-danger"
        data-confirm={confirm}
        aria-label={confirm ? t('task.deleteConfirm') : t('task.delete')}
        title={confirm ? t('task.deleteConfirm') : t('task.delete')}
        onClick={() => { if (confirm) onDelete(task.id); else setConfirm(true) }}
        onBlur={() => setConfirm(false)}
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <path d="M4 6.5h12M8 6.5V5h4v1.5M6 6.5l.7 8.5h6.6l.7-8.5M8.5 9v4M11.5 9v4" />
        </svg>
      </button>
    </li>
  )
}

/** Build a pointer-following ghost from the real card (values copied; original stays dimmed). */
function createGhost(card: HTMLElement): HTMLElement {
  const ghost = card.cloneNode(true) as HTMLElement
  ghost.classList.add('dsh-task-ghost')
  ghost.removeAttribute('data-task-id')
  const sources = card.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea')
  const copies = ghost.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea')
  sources.forEach((source, index) => {
    const copy = copies[index]
    if (copy !== undefined) copy.value = source.value
  })
  return ghost
}

interface PendingGroupMove {
  readonly group: DeskTaskGroup
  readonly status: TaskStatus
  readonly order: number
  readonly count: number
}

interface LastGroupMove {
  readonly group: DeskTaskGroup
  readonly name: string
  readonly fromStatus: TaskStatus
  readonly fromOrder: number
  readonly toStatus: TaskStatus
  readonly count: number
}

export function TaskBoard(props: TaskBoardProps): ReactElement {
  const {
    t, listTasks, createTask, updateTask, deleteTask,
    listGroups, createGroup: createGroupApi, updateGroup, moveGroup, deleteGroup,
  } = props
  const data = useTasksData(t, { listTasks, createTask, updateTask, deleteTask })
  const groupsData = useGroupsData(t, {
    listGroups,
    createGroup: createGroupApi,
    updateGroup,
    moveGroup,
    deleteGroup,
  })
  const board = useTaskBoard({
    tasks: data.tasks,
    setTasks: data.setTasks,
    savePatch: data.savePatch,
    addTask: data.addTask,
    removeWithFeedback: data.removeWithFeedback,
    setActionError: data.setActionError,
    groups: groupsData.groups,
    createGroup: groupsData.createGroup,
    renameGroup: groupsData.renameGroup,
    reorderGroups: groupsData.reorderGroups,
    removeGroup: groupsData.removeGroup,
    moveGroupToLane: groupsData.moveGroupToLane,
    reloadGroups: groupsData.reload,
  })
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [groupDrag, setGroupDrag] = useState<DeskTaskGroup | null>(null)
  const [pendingMove, setPendingMove] = useState<PendingGroupMove | null>(null)
  const [lastMove, setLastMove] = useState<LastGroupMove | null>(null)
  /** Below the threshold the three lanes collapse into count-only columns (no horizontal scroll). */
  const [compact, setCompact] = useState(false)
  const lanesRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const element = lanesRef.current
    if (element === null) return
    const update = (): void => setCompact(element.clientWidth > 0 && element.clientWidth < TASK_BOARD_COMPACT_WIDTH)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => { observer.disconnect() }
  }, [data.loading, groupsData.loading])

  const sortOptions = useMemo<readonly { mode: TaskSortMode; label: string }[]>(() => [
    { mode: 'manual', label: t('task.sort.manual') },
    { mode: 'created', label: t('task.sort.created') },
    { mode: 'due', label: t('task.sort.due') },
  ], [t])

  /** Resolve the lane/group under the pointer plus the insertion index within that container. */
  const resolveDrop = useCallback((x: number, y: number): { target: DropTarget; index: number } | null => {
    const element = document.elementFromPoint(x, y) as HTMLElement | null
    const lane = element?.closest<HTMLElement>('[data-lane]')
    if (lane === null || lane === undefined) return null
    const status = lane.dataset.lane as TaskStatus | undefined
    if (status === undefined) return null
    const zone = element?.closest<HTMLElement>('[data-group-id]')
    const groupId = zone?.dataset.groupId === undefined || zone.dataset.groupId === ''
      ? undefined
      : zone.dataset.groupId
    const scope = zone ?? lane.querySelector<HTMLElement>('.dsh-task-ungrouped')
    const cards = scope === null ? [] : [...scope.querySelectorAll<HTMLElement>('.dsh-task-card')]
    let index = cards.length
    for (const [position, card] of cards.entries()) {
      const rect = card.getBoundingClientRect()
      if (y < rect.top + rect.height / 2) {
        index = position
        break
      }
    }
    return { target: { status, ...groupId === undefined ? {} : { groupId } }, index }
  }, [])

  /** Whole-card pointer drag: ghost follows the pointer, invalid drops fly back to the card. */
  const startDrag = useCallback((task: DeskTask, event: ReactPointerEvent<HTMLElement>): void => {
    const target = event.target as HTMLElement
    if (event.button !== 0 || target.closest('input,textarea,button,select')) return
    const card = event.currentTarget
    const rect = card.getBoundingClientRect()
    const offsetX = event.clientX - rect.left
    const offsetY = event.clientY - rect.top
    event.preventDefault()

    const ghost = createGhost(card)
    ghost.style.position = 'fixed'
    ghost.style.left = `${rect.left}px`
    ghost.style.top = `${rect.top}px`
    ghost.style.width = `${rect.width}px`
    ghost.style.pointerEvents = 'none'
    ghost.style.zIndex = '9999'
    document.body.appendChild(ghost)
    card.style.visibility = 'hidden'
    setDraggingId(task.id)

    let latest = resolveDrop(event.clientX, event.clientY)
    setDropTarget(latest?.target ?? null)

    const onMove = (moveEvent: PointerEvent): void => {
      ghost.style.left = `${moveEvent.clientX - offsetX}px`
      ghost.style.top = `${moveEvent.clientY - offsetY}px`
      latest = resolveDrop(moveEvent.clientX, moveEvent.clientY)
      setDropTarget(latest?.target ?? null)
    }
    const cleanup = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onFinish)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
      setDraggingId(null)
      setDropTarget(null)
    }
    const flyBack = (): void => {
      ghost.style.transition = 'left 180ms ease, top 180ms ease'
      ghost.style.left = `${rect.left}px`
      ghost.style.top = `${rect.top}px`
      window.setTimeout(() => {
        ghost.remove()
        card.style.visibility = ''
      }, 200)
    }
    const onFinish = (): void => {
      cleanup()
      if (latest === null) {
        flyBack()
        return
      }
      ghost.remove()
      card.style.visibility = ''
      board.moveTask(task.id, latest.target.status, latest.target.groupId, latest.index)
    }
    const onCancel = (): void => {
      cleanup()
      flyBack()
    }
    const onKey = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key === 'Escape') onCancel()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onFinish)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
  }, [board, resolveDrop])

  const groupCardCount = useCallback(
    (group: DeskTaskGroup): number => data.tasks.filter(task => task.groupId === group.id && !task.archived).length,
    [data.tasks],
  )

  /** Group drop: same lane reorders immediately; another lane asks for confirmation first. */
  const handleGroupDrop = useCallback((status: TaskStatus, toIndex: number): void => {
    const group = groupDrag
    setGroupDrag(null)
    if (group === null) return
    if (group.status === status) {
      board.reorderGroup(status, group.id, toIndex)
      return
    }
    setPendingMove({ group, status, order: toIndex, count: groupCardCount(group) })
  }, [board, groupCardCount, groupDrag])

  const confirmGroupMove = useCallback(async (): Promise<void> => {
    const pending = pendingMove
    if (pending === null) return
    setPendingMove(null)
    const result = await board.moveGroupWhole(pending.group, pending.status, pending.order)
    if (result === null) return
    setLastMove({
      group: result.group,
      name: pending.group.name,
      fromStatus: pending.group.status,
      fromOrder: pending.group.order,
      toStatus: pending.status,
      count: pending.count,
    })
  }, [board, pendingMove])

  const undoGroupMove = useCallback(async (): Promise<void> => {
    const move = lastMove
    if (move === null) return
    setLastMove(null)
    const latest = groupsData.groups.find(group => group.id === move.group.id) ?? move.group
    await board.moveGroupWhole(latest, move.fromStatus, move.fromOrder)
  }, [board, groupsData.groups, lastMove])

  const loading = data.loading || groupsData.loading
  const loadError = data.loadError ?? groupsData.loadError
  const actionError = data.actionError ?? groupsData.actionError

  if (loadError !== null) {
    return (
      <div className="dsh-desk-tasksview">
        <p className="dsh-desk-error">{t('state.loadFailed', { message: loadError })}</p>
        <button
          type="button"
          className="dsh-desk-btn"
          onClick={() => { void data.reload(); void groupsData.reload() }}
        >
          {t('action.retry')}
        </button>
      </div>
    )
  }

  return (
    <div className="dsh-desk-tasksview">
      {actionError === null ? null : <p className="dsh-desk-error">{actionError}</p>}
      <div className="dsh-task-toolbar">
        {board.showArchive
          ? (
              <button type="button" className="dsh-task-tool" onClick={board.toggleArchive}>
                {t('task.backToBoard')}
              </button>
            )
          : (
              <>
                <div className="dsh-task-sort" role="group" aria-label={t('task.sort.label')}>
                  {sortOptions.map(option => (
                    <button
                      key={option.mode}
                      type="button"
                      className="dsh-task-tool"
                      data-active={board.sortMode === option.mode}
                      onClick={() => board.setSortMode(option.mode)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <button type="button" className="dsh-task-tool" onClick={board.toggleArchive}>
                  {t('task.archive')}{board.archivedTasks.length === 0 ? '' : ` (${board.archivedTasks.length})`}
                </button>
              </>
            )}
      </div>
      {board.showArchive
        ? (
            <div className="dsh-task-archive">
              {board.archivedTasks.length === 0
                ? <p className="dsh-desk-wall-hint">{t('task.archiveEmpty')}</p>
                : (
                    <ul className="dsh-task-archive-list">
                      {board.archivedTasks.map(task => (
                        <ArchiveRow
                          key={task.id}
                          task={task}
                          t={t}
                          onRestore={board.restoreTask}
                          onDelete={board.deleteTask}
                        />
                      ))}
                    </ul>
                  )}
            </div>
          )
        : (
            <>
              {pendingMove === null ? null : (
                <div className="dsh-task-movebar" role="alertdialog" aria-label={t('task.group.moveTitle')}>
                  <span className="dsh-task-movebar-text">
                    {t('task.group.moveConfirm', {
                      name: pendingMove.group.name,
                      count: pendingMove.count,
                      status: t(LANE_LABEL_KEY[pendingMove.status]),
                    })}
                  </span>
                  <button type="button" className="dsh-task-tool" onClick={() => { void confirmGroupMove() }}>
                    {t('task.group.moveAction')}
                  </button>
                  <button type="button" className="dsh-task-tool" onClick={() => setPendingMove(null)}>
                    {t('action.cancel')}
                  </button>
                </div>
              )}
              {lastMove === null ? null : (
                <div className="dsh-task-movebar">
                  <span className="dsh-task-movebar-text">
                    {t('task.group.moved', {
                      name: lastMove.name,
                      count: lastMove.count,
                      status: t(LANE_LABEL_KEY[lastMove.toStatus]),
                    })}
                  </span>
                  <button type="button" className="dsh-task-tool" onClick={() => { void undoGroupMove() }}>
                    {t('task.group.undo')}
                  </button>
                </div>
              )}
              <div className="dsh-task-lanes" data-loading={loading} data-compact={compact} ref={lanesRef}>
                {TASK_LANE_ORDER.map(status => (
                  <TaskColumn
                    key={status}
                    status={status}
                    title={t(LANE_LABEL_KEY[status])}
                    lane={board.lanes[status]}
                    compact={compact}
                    collapsed={status === 'done' && board.doneCollapsed}
                    draft={board.draft}
                    dropTarget={dropTarget}
                    draggingId={draggingId}
                    groupDrag={groupDrag}
                    t={t}
                    onAdd={board.beginDraft}
                    onToggleCollapse={board.toggleDone}
                    onCommitDraft={board.commitDraft}
                    onCancelDraft={board.cancelDraft}
                    onStartDrag={startDrag}
                    onPatch={data.savePatch}
                    onArchive={board.archiveTask}
                    onDelete={board.deleteTask}
                    isGroupCollapsed={board.isGroupCollapsed}
                    onToggleGroup={board.toggleGroup}
                    onCreateGroup={board.createGroup}
                    onRenameGroup={board.renameGroup}
                    onRemoveGroup={board.removeGroup}
                    onGroupDragStart={setGroupDrag}
                    onGroupDragEnd={() => { setGroupDrag(null); setPendingMove(null) }}
                    onGroupDrop={handleGroupDrop}
                  />
                ))}
              </div>
            </>
          )}
    </div>
  )
}
