/**
 * Task board: toolbar, three lanes with first-class groups, pointer dragging for cards and for
 * whole groups (same interaction model: a ghost follows the pointer, invalid drops fly back),
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
import { TaskColumn, type DropTarget, type GroupDropTarget } from './TaskColumn.js'
import { useGroupsData } from '../hooks/useGroupsData.js'
import { useSessionLinks } from '../hooks/useSessionLinks.js'
import { useTaskBoard } from '../hooks/useTaskBoard.js'
import { useTasksData } from '../hooks/useTasksData.js'
import { TASK_LANE_ORDER, type TaskSortMode } from '../types.js'
import type { SessionChipInfo, SessionLinkApi } from '../../sessions/contract.js'

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
  readonly archiveGroup: (input: {
    id: string
    expectedRevision: number
    archived: boolean
  }) => Promise<{ group: DeskTaskGroup; tasks: readonly DeskTask[] }>
  readonly deleteGroup: (id: string) => Promise<void>
}

interface TaskBoardProps extends TaskBoardInjected {
  readonly t: DeskTranslator
  /** Optional session services facade; disabled when the host doesn't expose them. */
  readonly sessionLink: SessionLinkApi
}

/** Static locale keys per lane (the dictionary key type is a closed union). */
const LANE_LABEL_KEY = {
  todo: 'task.lane.todo',
  doing: 'task.lane.doing',
  done: 'task.lane.done',
} as const

/** Two-step delete row for an archived group (deleting it also deletes its cards). */
function GroupArchiveRow({
  group, countLabel, t, onRestore, onDelete,
}: {
  readonly group: DeskTaskGroup
  readonly countLabel: string
  readonly t: DeskTranslator
  readonly onRestore: (group: DeskTaskGroup) => void
  readonly onDelete: (group: DeskTaskGroup) => void
}): ReactElement {
  const [confirm, setConfirm] = useState(false)
  return (
    <li className="dsh-task-archive-row">
      <span className="dsh-task-archive-group-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2.8 6.2h5l1.4 1.6h8v7.4H2.8zM2.8 6.2V4.8h5" />
        </svg>
      </span>
      <span className="dsh-task-archive-title">{group.name}</span>
      <span className="dsh-task-archive-count">{countLabel}</span>
      <span className="dsh-task-archive-lane">{t(LANE_LABEL_KEY[group.status])}</span>
      <button
        type="button"
        className="dsh-desk-iconbtn"
        aria-label={t('task.group.restore')}
        title={t('task.group.restore')}
        onClick={() => onRestore(group)}
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
        onClick={() => { if (confirm) onDelete(group); else setConfirm(true) }}
        onBlur={() => setConfirm(false)}
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <path d="M4 6.5h12M8 6.5V5h4v1.5M6 6.5l.7 8.5h6.6l.7-8.5M8.5 9v4M11.5 9v4" />
        </svg>
      </button>
    </li>
  )
}

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

/** Copy live input values into a cloned node (cloneNode keeps attributes, not DOM properties). */
function copyFieldValues(source: HTMLElement, clone: HTMLElement): void {
  const sources = source.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea')
  const copies = clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea')
  sources.forEach((field, index) => {
    const copy = copies[index]
    if (copy !== undefined) copy.value = field.value
  })
}

/** Build a pointer-following ghost from the real card (values copied; original stays dimmed). */
function createCardGhost(card: HTMLElement): HTMLElement {
  const ghost = card.cloneNode(true) as HTMLElement
  ghost.classList.add('dsh-task-ghost')
  ghost.removeAttribute('data-task-id')
  copyFieldValues(card, ghost)
  return ghost
}

/** Whole-group ghost: the header + its cards move together, exactly like a card. */
function createGroupGhost(group: HTMLElement): HTMLElement {
  const ghost = group.cloneNode(true) as HTMLElement
  ghost.classList.add('dsh-task-group-ghost')
  ghost.removeAttribute('data-dragging')
  ghost.querySelectorAll<HTMLElement>('[data-group-id]').forEach(node => node.removeAttribute('data-group-id'))
  copyFieldValues(group, ghost)
  return ghost
}

function placeGhost(ghost: HTMLElement, left: number, top: number, width: number): void {
  ghost.style.position = 'fixed'
  ghost.style.left = `${left}px`
  ghost.style.top = `${top}px`
  ghost.style.width = `${width}px`
  ghost.style.pointerEvents = 'none'
  ghost.style.zIndex = '9999'
}

/**
 * Suppress native text selection while a pointer drag is possible. Because clicks must still
 * work (field editing / double-click rename), this is applied per gesture and always restored.
 */
function lockSelection(): () => void {
  const previous = document.body.style.userSelect
  document.body.style.userSelect = 'none'
  window.getSelection()?.removeAllRanges()
  let released = false
  return () => {
    if (released) return
    released = true
    document.body.style.userSelect = previous
  }
}

export function TaskBoard(props: TaskBoardProps): ReactElement {
  const {
    t, listTasks, createTask, updateTask, deleteTask,
    listGroups, createGroup: createGroupApi, updateGroup, moveGroup, archiveGroup: archiveGroupApi, deleteGroup,
    sessionLink,
  } = props
  const data = useTasksData(t, { listTasks, createTask, updateTask, deleteTask })
  const groupsData = useGroupsData(t, {
    listGroups,
    createGroup: createGroupApi,
    updateGroup,
    moveGroup,
    deleteGroup,
    archiveGroup: archiveGroupApi,
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
    setGroupOrders: groupsData.setGroupOrders,
    removeGroup: groupsData.removeGroup,
    moveGroupToLane: groupsData.moveGroupToLane,
    archiveGroup: groupsData.archiveGroup,
  })
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [groupDrag, setGroupDrag] = useState<DeskTaskGroup | null>(null)
  const [groupDrop, setGroupDrop] = useState<GroupDropTarget | null>(null)
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

  /** Resolve a card drop: a group's card list, or the lane's shared block sequence. */
  const resolveCardDrop = useCallback((x: number, y: number, movingTaskId: string): DropTarget | null => {
    const element = document.elementFromPoint(x, y) as HTMLElement | null
    const lane = element?.closest<HTMLElement>('[data-lane]')
    if (lane === null || lane === undefined) return null
    const status = lane.dataset.lane as TaskStatus | undefined
    if (status === undefined) return null
    const zone = element?.closest<HTMLElement>('[data-group-id]')
    const groupId = zone?.dataset.groupId === undefined || zone.dataset.groupId === ''
      ? undefined
      : zone.dataset.groupId
    if (groupId !== undefined) {
      const cards = [...zone!.querySelectorAll<HTMLElement>('[data-task-id]')]
      let index = cards.length
      for (const [position, card] of cards.entries()) {
        const rect = card.getBoundingClientRect()
        if (y < rect.top + rect.height / 2) {
          index = position
          break
        }
      }
      return { status, groupId, index }
    }
    // Ungrouped position: the pointer selects an insertion index in the unified block list,
    // excluding the card being dragged (its block still occupies its slot).
    const blocks = [...lane.querySelectorAll<HTMLElement>('.dsh-task-block')]
    let index = 0
    for (const block of blocks) {
      if (block.querySelector<HTMLElement>('[data-task-id]')?.dataset.taskId === movingTaskId) continue
      const rect = block.getBoundingClientRect()
      if (y < rect.top + rect.height / 2) break
      index += 1
    }
    return { status, index, block: true }
  }, [])

  /** Resolve the lane plus block insertion position under the pointer (group drag). */
  const resolveGroupDrop = useCallback((x: number, y: number, excludeGroupId: string): GroupDropTarget | null => {
    const element = document.elementFromPoint(x, y) as HTMLElement | null
    const lane = element?.closest<HTMLElement>('[data-lane]')
    if (lane === null || lane === undefined) return null
    const status = lane.dataset.lane as TaskStatus | undefined
    if (status === undefined) return null
    let index = 0
    for (const block of lane.querySelectorAll<HTMLElement>('.dsh-task-block')) {
      // Skip the dragged group's block: index is an insertion into the remaining list.
      if (block.querySelector<HTMLElement>('.dsh-task-group')?.dataset.groupId === excludeGroupId) continue
      const rect = block.getBoundingClientRect()
      if (y < rect.top + rect.height / 2) break
      index += 1
    }
    return { status, index }
  }, [])

  /** Whole-card pointer drag: a 5px threshold separates a click (edit) from a drag (move). */
  const startDrag = useCallback((task: DeskTask, event: ReactPointerEvent<HTMLElement>): void => {
    const target = event.target as HTMLElement
    if (event.button !== 0 || target.closest('input,textarea,button,select')) return
    const card = event.currentTarget
    const rect = card.getBoundingClientRect()
    const offsetX = event.clientX - rect.left
    const offsetY = event.clientY - rect.top
    const startX = event.clientX
    const startY = event.clientY
    const releaseSelection = lockSelection()
    let ghost: HTMLElement | null = null
    let moved = false
    let latest: DropTarget | null = null

    const begin = (): void => {
      ghost = createCardGhost(card)
      placeGhost(ghost, rect.left, rect.top, rect.width)
      document.body.appendChild(ghost)
      card.style.visibility = 'hidden'
      setDraggingId(task.id)
    }
    const onMove = (moveEvent: PointerEvent): void => {
      if (!moved) {
        if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 5) return
        moved = true
        begin()
      }
      if (ghost === null) return
      ghost.style.left = `${moveEvent.clientX - offsetX}px`
      ghost.style.top = `${moveEvent.clientY - offsetY}px`
      latest = resolveCardDrop(moveEvent.clientX, moveEvent.clientY, task.id)
      setDropTarget(latest)
    }
    const cleanup = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onFinish)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
      releaseSelection()
      setDraggingId(null)
      setDropTarget(null)
    }
    /** A real drag must not leak into a click that would open a field for editing. */
    const suppressNextClick = (): void => {
      const blocker = (clickEvent: MouseEvent): void => {
        clickEvent.stopPropagation()
        clickEvent.preventDefault()
      }
      window.addEventListener('click', blocker, { capture: true, once: true })
    }
    const flyBack = (): void => {
      if (ghost === null) return
      const element = ghost
      element.style.transition = 'left 180ms ease, top 180ms ease'
      element.style.left = `${rect.left}px`
      element.style.top = `${rect.top}px`
      window.setTimeout(() => {
        element.remove()
        card.style.visibility = ''
      }, 200)
    }
    const onFinish = (): void => {
      cleanup()
      // No threshold crossed: this was a click, so TaskCard opens the clicked field for editing.
      if (!moved || ghost === null) return
      suppressNextClick()
      if (latest === null) {
        flyBack()
        return
      }
      ghost.remove()
      card.style.visibility = ''
      board.moveTask(task.id, latest.status, latest.groupId, latest.index)
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
  }, [board, resolveCardDrop])

  /**
   * Whole-group drag: same 5px threshold and ghost model as a card. Drop on the same lane
   * reorders groups; another lane moves the whole group and cascades its cards' status immediately.
   */
  const startGroupDrag = useCallback((group: DeskTaskGroup, event: ReactPointerEvent<HTMLElement>): void => {
    const target = event.target as HTMLElement
    if (event.button !== 0 || target.closest('input,textarea,button')) return
    const block = event.currentTarget.closest<HTMLElement>('.dsh-task-group')
    if (block === null) return
    const rect = block.getBoundingClientRect()
    const offsetX = event.clientX - rect.left
    const offsetY = event.clientY - rect.top
    const startX = event.clientX
    const startY = event.clientY
    const releaseSelection = lockSelection()
    let ghost: HTMLElement | null = null
    let moved = false
    let latest: GroupDropTarget | null = null

    const begin = (): void => {
      ghost = createGroupGhost(block)
      placeGhost(ghost, rect.left, rect.top, rect.width)
      document.body.appendChild(ghost)
      setGroupDrag(group)
    }
    const onMove = (moveEvent: PointerEvent): void => {
      if (!moved) {
        if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 5) return
        moved = true
        begin()
      }
      if (ghost === null) return
      ghost.style.left = `${moveEvent.clientX - offsetX}px`
      ghost.style.top = `${moveEvent.clientY - offsetY}px`
      latest = resolveGroupDrop(moveEvent.clientX, moveEvent.clientY, group.id)
      setGroupDrop(latest)
    }
    const cleanup = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onFinish)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
      releaseSelection()
      setGroupDrag(null)
      setGroupDrop(null)
    }
    const flyBack = (): void => {
      if (ghost === null) return
      const element = ghost
      element.style.transition = 'left 180ms ease, top 180ms ease'
      element.style.left = `${rect.left}px`
      element.style.top = `${rect.top}px`
      window.setTimeout(() => element.remove(), 200)
    }
    const onFinish = (): void => {
      cleanup()
      // Below the threshold this was a click (group name double-click renames, buttons click).
      if (!moved || ghost === null) return
      if (latest === null) {
        flyBack()
        return
      }
      ghost.remove()
      board.moveGroupBlock(group, latest.status, latest.index)
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
  }, [board, resolveGroupDrop])

  const loading = data.loading || groupsData.loading
  const loadError = data.loadError ?? groupsData.loadError
  const actionError = data.actionError ?? groupsData.actionError
  const countText = (count: number): string => count === 1 ? t('task.countOne') : t('task.count', { count })

  // Session links resolve live; a linked id that the host list no longer knows stays visible as
  // "unavailable" instead of being silently dropped from the card.
  const sessionSnapshot = useSessionLinks(sessionLink)
  const sessionById = useMemo(
    () => new Map(sessionSnapshot.sessions.map(session => [session.id, session])),
    [sessionSnapshot.sessions],
  )
  // Same session universe as the composer's `@` source (the host session list): subagent
  // sessions are included too, and archived ones stay selectable with a hollow status dot.
  const sessionOptions = sessionSnapshot.sessions
  const sessionsFor = useCallback((ids: readonly string[]): readonly SessionChipInfo[] => ids.map(id =>
    sessionById.get(id) ?? {
      id,
      title: t('task.session.unavailable'),
      running: false,
      availability: 'unavailable' as const,
      updatedAt: 0,
      subagent: false,
    }), [sessionById, t])
  const linkSessions = useCallback((task: DeskTask, sessionIds: readonly string[]): void => {
    data.savePatch(task, { sessionIds })
  }, [data.savePatch])

  /** Archived groups own archived cards: deleting the group also deletes those cards host-side. */
  const deleteArchivedGroup = (group: DeskTaskGroup): void => {
    data.setTasks(current => current.filter(task => task.groupId !== group.id))
    groupsData.removeGroup(group)
  }

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
              {board.archivedGroups.length === 0 && board.archivedTasks.length === 0
                ? <p className="dsh-desk-wall-hint">{t('task.archiveEmpty')}</p>
                : (
                    <ul className="dsh-task-archive-list">
                      {board.archivedGroups.map(group => (
                        <GroupArchiveRow
                          key={group.id}
                          group={group}
                          countLabel={countText(data.tasks.filter(task => task.groupId === group.id && task.archived).length)}
                          t={t}
                          onRestore={archived => { void board.archiveGroup(archived, false) }}
                          onDelete={deleteArchivedGroup}
                        />
                      ))}
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
                  blockDrop={dropTarget?.block === true ? { status: dropTarget.status, index: dropTarget.index } : null}
                  groupDrop={groupDrop}
                  draggingId={draggingId}
                  groupDrag={groupDrag}
                  t={t}
                  onAdd={board.beginDraft}
                  onToggleCollapse={board.toggleDone}
                  onCommitDraft={board.commitDraft}
                  onCancelDraft={board.cancelDraft}
                  onStartDrag={startDrag}
                  onGroupStartDrag={startGroupDrag}
                  onPatch={data.savePatch}
                  onArchive={board.archiveTask}
                  onDelete={board.deleteTask}
                  isGroupCollapsed={board.isGroupCollapsed}
                  onToggleGroup={board.toggleGroup}
                  onCreateGroup={board.createGroup}
                  onRenameGroup={board.renameGroup}
                  onRemoveGroup={board.removeGroup}
                  onArchiveGroup={(group) => { void board.archiveGroup(group, true) }}
                  sessionEnabled={sessionSnapshot.enabled}
                  sessionOptions={sessionOptions}
                  sessionsFor={sessionsFor}
                  onLinkSessions={linkSessions}
                  onOpenSession={sessionLink.open}
                />
              ))}
            </div>
          )}
    </div>
  )
}
