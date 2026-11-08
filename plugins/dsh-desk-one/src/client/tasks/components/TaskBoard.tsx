/**
 * Task board view: three lanes with first-class groups, pointer dragging for cards and for whole
 * groups (a ghost follows the pointer, invalid drops fly back), double-click-to-add and the
 * archive list. Data + board state are owned by DeskOnePage so the shared header can host the
 * view actions; this component stays a controlled renderer.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react'
import { TASK_BOARD_COMPACT_WIDTH } from '../../../constants.js'
import type { DeskTask, DeskTaskGroup, TaskStatus } from '../../../contract.js'
import type { DeskTranslator } from '../../app/types.js'
import type { SessionChipInfo, SessionLinkApi } from '../../sessions/contract.js'
import type { GroupsData } from '../hooks/useGroupsData.js'
import { useSessionLinks } from '../hooks/useSessionLinks.js'
import type { TaskBoardApi } from '../hooks/useTaskBoard.js'
import type { TasksData } from '../hooks/useTasksData.js'
import { TASK_LANE_ORDER } from '../types.js'
import { LANE_LABEL_KEY } from '../taskLabels.js'
import { TaskArchiveView } from './TaskArchiveView.js'
import { TaskColumn, type DropTarget, type GroupDropTarget } from './TaskColumn.js'
import { createCardGhost, createGroupGhost, lockSelection, placeGhost } from './taskDrag.js'

interface TaskBoardProps {
  readonly t: DeskTranslator
  readonly data: TasksData
  readonly groupsData: GroupsData
  readonly board: TaskBoardApi
  /** Optional session services facade; disabled when the host doesn't expose them. */
  readonly sessionLink: SessionLinkApi
}

export function TaskBoard({ t, data, groupsData, board, sessionLink }: TaskBoardProps): ReactElement {  const [draggingId, setDraggingId] = useState<string | null>(null)
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
   * reorders blocks in the lane sequence; another lane moves the whole group and cascades its cards.
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
  // sessions are included too; archived ones stay selectable and render with the neutral status tint.
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
      {board.showArchive
        ? (
            <TaskArchiveView
              tasks={board.archivedTasks}
              groups={board.archivedGroups}
              t={t}
              countText={countText}
              onRestoreGroup={(group) => { void board.archiveGroup(group, false) }}
              onDeleteGroup={deleteArchivedGroup}
              onRestoreTask={board.restoreTask}
              onDeleteTask={board.deleteTask}
            />
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
