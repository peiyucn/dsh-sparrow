/**
 * One task card on the board.
 *
 * Title editing is uncontrolled (same reason as notes: typing must not re-render the whole
 * board). Colour / due date / archive / delete live in the card; delete uses the two-step
 * confirmation pattern so a single stray click cannot destroy a task.
 */

import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react'
import { NOTE_COLORS } from '../../../constants.js'
import type { DeskTask, NoteColor, TaskPatchRequest } from '../../../contract.js'
import type { DeskTranslator } from '../../app/types.js'

interface TaskCardProps {
  readonly task: DeskTask
  readonly dragging: boolean
  readonly t: DeskTranslator
  readonly onStartDrag: (task: DeskTask, event: ReactPointerEvent<HTMLElement>) => void
  readonly onPatch: (task: DeskTask, patch: TaskPatchRequest) => void
  readonly onArchive: (task: DeskTask) => void
  readonly onDelete: (id: string) => void
}

/** Local YYYY-MM-DD (due dates are day-granular, so "overdue" is a local-calendar question). */
function localToday(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function TaskCard({
  task, dragging, t, onStartDrag, onPatch, onArchive, onDelete,
}: TaskCardProps): ReactElement {
  const titleRef = useRef<HTMLInputElement | null>(null)
  const [editingDue, setEditingDue] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const overdue = task.due !== undefined && task.due.date < localToday()

  // External title changes (agent / reload) flow into the uncontrolled input unless focused.
  useEffect(() => {
    const element = titleRef.current
    if (element !== null && document.activeElement !== element) element.value = task.title
  }, [task.title])

  const commitTitle = (element: HTMLInputElement): void => {
    const title = element.value.trim()
    if (title === '') {
      element.value = task.title
      return
    }
    if (title !== task.title) onPatch(task, { title })
  }

  return (
    <article
      className="dsh-task-card"
      data-color={task.color}
      data-task-id={task.id}
      data-dragging={dragging}
      onPointerDown={(event) => onStartDrag(task, event)}
    >
      <input
        ref={titleRef}
        className="dsh-task-title"
        defaultValue={task.title}
        aria-label={t('task.title')}
        spellCheck={false}
        onBlur={event => commitTitle(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            event.currentTarget.value = task.title
            event.currentTarget.blur()
          }
        }}
      />
      <div className="dsh-task-meta">
        <div className="dsh-task-colors">
          {NOTE_COLORS.map((color: NoteColor) => (
            <button
              key={color}
              type="button"
              className="dsh-task-color"
              data-color={color}
              data-active={task.color === color}
              aria-label={t(`color.${color}`)}
              title={t(`color.${color}`)}
              onClick={() => onPatch(task, { color })}
            />
          ))}
        </div>
        {editingDue
          ? (
              <input
                className="dsh-task-due-input"
                type="date"
                defaultValue={task.due?.date ?? ''}
                autoFocus
                onBlur={(event) => {
                  setEditingDue(false)
                  onPatch(task, { due: event.currentTarget.value === '' ? null : { date: event.currentTarget.value } })
                }}
              />
            )
          : (
              <button
                type="button"
                className="dsh-task-due"
                data-overdue={overdue}
                data-empty={task.due === undefined}
                title={task.due === undefined ? t('task.setDue') : t('task.due')}
                onClick={() => setEditingDue(true)}
              >
                {task.due?.date ?? t('task.setDue')}
              </button>
            )}
        <div className="dsh-task-actions">
          <button
            type="button"
            className="dsh-desk-iconbtn dsh-desk-iconbtn-sm"
            aria-label={t('task.archive')}
            title={t('task.archive')}
            onClick={() => onArchive(task)}
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M4 5.5h12v11H4zM3 3.5h14v2H3zM8 9h4" />
            </svg>
          </button>
          <button
            type="button"
            className="dsh-desk-iconbtn dsh-desk-iconbtn-sm dsh-desk-iconbtn-danger"
            data-confirm={confirmDelete}
            aria-label={confirmDelete ? t('task.deleteConfirm') : t('task.delete')}
            title={confirmDelete ? t('task.deleteConfirm') : t('task.delete')}
            onClick={() => {
              if (confirmDelete) onDelete(task.id)
              else setConfirmDelete(true)
            }}
            onBlur={() => setConfirmDelete(false)}
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6.5h12M8 6.5V5h4v1.5M6 6.5l.7 8.5h6.6l.7-8.5M8.5 9v4M11.5 9v4" />
            </svg>
          </button>
        </div>
      </div>
    </article>
  )
}
