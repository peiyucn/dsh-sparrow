/**
 * One task card.
 *
 * The card has two modes: view (default) and edit (one field at a time). In view mode the whole
 * card is a drag surface and title/body are plain text — clicking a field switches it to a
 * textarea. That removes the old ambiguity where most of the card was a textarea and therefore
 * not grabbable; the board distinguishes click vs drag by a movement threshold.
 */

import { useEffect, useRef, useState } from 'react'
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

type EditableField = 'title' | 'body'

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
  const [editing, setEditing] = useState<EditableField | null>(null)
  const [editingDue, setEditingDue] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  const remaining = task.due === undefined ? undefined : daysUntil(task.due.date)
  const overdue = remaining !== undefined && remaining < 0
  const dueSoon = remaining !== undefined && remaining >= 0 && remaining <= 1
  const canArchive = task.status === 'done'

  // Keep edit-mode textareas sized to their content when a field is opened.
  useEffect(() => {
    if (editing === 'title') autoGrow(titleRef.current)
    if (editing === 'body') autoGrow(bodyRef.current)
  }, [editing])

  // Colour palette: close on outside press / Esc (same dismissal rule as other popovers).
  useEffect(() => {
    if (!paletteOpen) return
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Element
        && (target.closest('.dsh-task-color-pop') !== null || target.closest('[data-color-anchor]') !== null)) return
      setPaletteOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setPaletteOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [paletteOpen])

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
      {editing === 'title'
        ? (
            <textarea
              ref={titleRef}
              className="dsh-task-title"
              rows={1}
              defaultValue={task.title}
              autoFocus
              aria-label={t('task.title')}
              spellCheck={false}
              onFocus={event => autoGrow(event.currentTarget)}
              onInput={event => autoGrow(event.currentTarget)}
              onBlur={(event) => {
                setEditing(null)
                const title = event.currentTarget.value.trim()
                if (title === '' || title === task.title) return
                onPatch(task, { title })
              }}
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
          )
        : (
            <div
              className="dsh-task-title dsh-task-text"
              onClick={() => setEditing('title')}
            >
              {task.title}
            </div>
          )}
      {editing === 'body'
        ? (
            <textarea
              ref={bodyRef}
              className="dsh-task-body"
              rows={1}
              defaultValue={task.body}
              autoFocus
              placeholder={t('task.bodyPlaceholder')}
              spellCheck={false}
              onFocus={event => autoGrow(event.currentTarget)}
              onInput={event => autoGrow(event.currentTarget)}
              onBlur={(event) => {
                setEditing(null)
                if (event.currentTarget.value !== task.body) onPatch(task, { body: event.currentTarget.value })
              }}
            />
          )
        : (
            <div
              className={task.body === '' ? 'dsh-task-body dsh-task-text dsh-task-body-empty' : 'dsh-task-body dsh-task-text'}
              onClick={() => setEditing('body')}
            >
              {task.body === '' ? t('task.bodyPlaceholder') : task.body}
            </div>
          )}
      <div className="dsh-task-foot">
        <button
          type="button"
          className="dsh-task-color"
          data-color={task.color}
          data-color-anchor="true"
          aria-label={t('task.color')}
          aria-haspopup="true"
          aria-expanded={paletteOpen}
          title={t('task.color')}
          onClick={() => setPaletteOpen(open => !open)}
        />
        {paletteOpen
          ? (
              <div className="dsh-task-color-pop" role="listbox" aria-label={t('task.color')}>
                {NOTE_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    role="option"
                    aria-selected={task.color === color}
                    className="dsh-task-color-swatch"
                    data-color={color}
                    data-active={task.color === color}
                    aria-label={t(`color.${color}`)}
                    title={t(`color.${color}`)}
                    onClick={() => {
                      setPaletteOpen(false)
                      if (color !== task.color) onPatch(task, { color })
                    }}
                  />
                ))}
              </div>
            )
          : null}
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
