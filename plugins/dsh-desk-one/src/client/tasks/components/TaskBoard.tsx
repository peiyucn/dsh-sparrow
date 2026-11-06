/**
 * Task board: toolbar (sort view, archive), three fixed lanes, pointer drag to move/reorder,
 * and the archive view. Drag uses window pointer events + `elementFromPoint`, matching the
 * notes wall's gesture model instead of introducing a second DnD system.
 */

import { useCallback, useMemo, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react'
import type { CreateTaskRequest, DeskTask, TaskPatchRequest, TaskStatus } from '../../../contract.js'
import type { DeskTranslator } from '../../app/types.js'
import { TaskColumn } from './TaskColumn.js'
import { useTaskBoard } from '../hooks/useTaskBoard.js'
import { useTasksData } from '../hooks/useTasksData.js'
import { TASK_LANE_ORDER, type TaskSortMode } from '../types.js'

export interface TaskBoardInjected {
  readonly listTasks: () => Promise<readonly DeskTask[]>
  readonly createTask: (input: CreateTaskRequest) => Promise<DeskTask>
  readonly updateTask: (input: { id: string; expectedRevision: number; patch: TaskPatchRequest }) => Promise<DeskTask>
  readonly deleteTask: (id: string) => Promise<void>
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

export function TaskBoard(props: TaskBoardProps): ReactElement {
  const { t, listTasks, createTask, updateTask, deleteTask } = props
  const data = useTasksData(t, { listTasks, createTask, updateTask, deleteTask })
  const board = useTaskBoard({
    tasks: data.tasks,
    setTasks: data.setTasks,
    savePatch: data.savePatch,
    addTask: data.addTask,
    removeWithFeedback: data.removeWithFeedback,
    setActionError: data.setActionError,
    t,
  })
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropLane, setDropLane] = useState<TaskStatus | null>(null)

  const sortOptions = useMemo<readonly { mode: TaskSortMode; label: string }[]>(() => [
    { mode: 'manual', label: t('task.sort.manual') },
    { mode: 'created', label: t('task.sort.created') },
    { mode: 'due', label: t('task.sort.due') },
  ], [t])

  /** Pointer drag: window listeners + elementFromPoint keeps lane/index lookup independent of DOM nesting. */
  const startDrag = useCallback((task: DeskTask, event: ReactPointerEvent<HTMLElement>): void => {
    const target = event.target as HTMLElement
    if (event.button !== 0 || target.closest('input,button,textarea,select')) return
    event.preventDefault()
    setDraggingId(task.id)
    const onMove = (moveEvent: PointerEvent): void => {
      const lane = (document.elementFromPoint(moveEvent.clientX, moveEvent.clientY) as Element | null)
        ?.closest('[data-lane]') as HTMLElement | null
      setDropLane(lane?.dataset.lane as TaskStatus | undefined ?? null)
    }
    const finish = (moveEvent: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      setDraggingId(null)
      setDropLane(null)
      const lane = (document.elementFromPoint(moveEvent.clientX, moveEvent.clientY) as Element | null)
        ?.closest('[data-lane]') as HTMLElement | null
      if (lane === null) return
      const status = lane.dataset.lane as TaskStatus | undefined
      if (status === undefined) return
      const cards = [...lane.querySelectorAll<HTMLElement>('[data-task-id]')]
      let index = cards.length
      for (const [position, card] of cards.entries()) {
        const rect = card.getBoundingClientRect()
        if (moveEvent.clientY < rect.top + rect.height / 2) {
          index = position
          break
        }
      }
      board.moveTask(task.id, status, index)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }, [board])

  if (data.loadError !== null) {
    return (
      <div className="dsh-desk-tasksview">
        <p className="dsh-desk-error">{t('state.loadFailed', { message: data.loadError })}</p>
        <button type="button" className="dsh-desk-btn" onClick={() => { void data.reload() }}>{t('action.retry')}</button>
      </div>
    )
  }

  return (
    <div className="dsh-desk-tasksview">
      {data.actionError === null ? null : <p className="dsh-desk-error">{data.actionError}</p>}
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
            <div className="dsh-task-lanes" data-loading={data.loading}>
              {TASK_LANE_ORDER.map(status => (
                <TaskColumn
                  key={status}
                  status={status}
                  title={t(LANE_LABEL_KEY[status])}
                  tasks={board.lanes[status]}
                  collapsed={status === 'done' && board.doneCollapsed}
                  draft={board.draftLane === status}
                  dragOver={dropLane === status && draggingId !== null}
                  draggingId={draggingId}
                  t={t}
                  onAdd={board.beginDraft}
                  onToggleCollapse={board.toggleDone}
                  onCommitDraft={board.commitDraft}
                  onCancelDraft={board.cancelDraft}
                  onStartDrag={startDrag}
                  onPatch={data.savePatch}
                  onArchive={board.archiveTask}
                  onDelete={board.deleteTask}
                />
              ))}
            </div>
          )}
    </div>
  )
}
