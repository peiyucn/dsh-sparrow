/**
 * One task card on the board.
 *
 * The whole card is the drag handle (no tiny grip): pointerdown starts the board-level ghost
 * drag, while inputs/buttons keep their own gestures. Title and body are auto-growing textareas
 * so long text wraps instead of being clipped. The footer keeps the card metadata in one row:
 * colour, due date, and (on hover) archive / delete. Only Done cards can be archived.
 */

import { useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react'
import { NOTE_COLORS } from '../../../constants.js'
import type { DeskTask, TaskPatchRequest } from '../../../contract.js'
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

/** Local YYYY-MM-DD (due dates are day-granular, so "due soon" is a local-calendar question). */
function localToday(): Date {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now
}

function daysUntil(date: string): number {
  const target = new Date(`${date}T00:00:00`)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - localToday().getTime()) / 86_400_000)
}

/** Reset height then follow scrollHeight — the standard textarea auto-grow trick. */
function autoGrow(element: HTMLTextAreaElement | null): void {
  if (element === null) return
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}

export function TaskCard({
  task, dragging, t, onStartDrag, onPatch, onArchive, onDelete,
}: TaskCardProps): ReactElement {
  const titleRef = useRef<HTMLTextAreaElement | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)
  const [editingDue, setEditingDue] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const remaining = task.due === undefined ? undefined : daysUntil(task.due.date)
  const overdue = remaining !== undefined && remaining < 0
  const dueSoon = remaining !== undefined && remaining >= 0 && remaining <= 1
  const canArchive = task.status === 'done'

  // Keep the uncontrolled fields in sync with external updates and keep heights fitting content.
  useLayoutEffect(() => {
    if (titleRef.current !== null) titleRef.current.value = task.title
    if (bodyRef.current !== null) bodyRef.current.value = task.body
    autoGrow(titleRef.current)
    autoGrow(bodyRef.current)
  }, [task.title, task.body])

  const commitTitle = (element: HTMLTextAreaElement): void => {
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
      data-overdue={overdue}
      data-due-soon={dueSoon}
      onPointerDown={(event) => onStartDrag(task, event)}
    >
      <textarea
        ref={titleRef}
        className="dsh-task-title"
        rows={1}
        defaultValue={task.title}
        aria-label={t('task.title')}
        spellCheck={false}
        onInput={event => autoGrow(event.currentTarget)}
        onBlur={event => commitTitle(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          }
          if (event.key === 'Escape') {
            event.currentTarget.value = task.title
            event.currentTarget.blur()
          }
        }}
      />
      <textarea
        ref={bodyRef}
        className="dsh-task-body"
        rows={1}
        defaultValue={task.body}
        placeholder={t('task.bodyPlaceholder')}
        spellCheck={false}
        onInput={event => autoGrow(event.currentTarget)}
        onBlur={(event) => {
          const body = event.currentTarget.value
          if (body !== task.body) onPatch(task, { body })
        }}
      />
      <div className="dsh-task-foot">
        <button
          type="button"
          className="dsh-task-color"
          data-color={task.color}
          aria-label={t(`color.${task.color}`)}
          title={t(`color.${task.color}`)}
          onClick={() => {
            const index = NOTE_COLORS.indexOf(task.color)
            onPatch(task, { color: NOTE_COLORS[(index + 1) % NOTE_COLORS.length] })
          }}
        />
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
                data-soon={dueSoon}
                data-empty={task.due === undefined}
                title={task.due === undefined ? t('task.setDue') : t('task.due')}
                onClick={() => setEditingDue(true)}
              >
                {task.due === undefined ? t('task.setDue') : task.due.date}
              </button>
            )}
        <div className="dsh-task-actions">
          {canArchive
            ? (
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
              )
            : null}
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
