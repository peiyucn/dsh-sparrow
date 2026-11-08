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
import { createPortal } from 'react-dom'
import { MAX_TASK_SESSIONS, NOTE_COLORS } from '../../../constants.js'
import type { DeskTask, TaskPatchRequest } from '../../../contract.js'
import type { DeskTranslator } from '../../app/types.js'
import type { SessionChipInfo } from '../../sessions/contract.js'
import { useAnchoredPanel } from '../hooks/useAnchoredPanel.js'

interface TaskCardProps {
  readonly task: DeskTask
  readonly dragging: boolean
  readonly t: DeskTranslator
  readonly onStartDrag: (task: DeskTask, event: ReactPointerEvent<HTMLElement>) => void
  readonly onPatch: (task: DeskTask, patch: TaskPatchRequest) => void
  readonly onArchive: (task: DeskTask) => void
  readonly onDelete: (id: string) => void
  /** False when the host lacks the optional session services — the @ entry stays hidden. */
  readonly sessionEnabled: boolean
  /** Linkable sessions (same universe as the composer's @ list, subagent sessions included). */
  readonly sessionOptions: readonly SessionChipInfo[]
  /** This card's linked sessions, resolved live (unavailable ids keep a fallback chip). */
  readonly sessionChips: readonly SessionChipInfo[]
  readonly onLinkSessions: (sessionIds: readonly string[]) => void
  readonly onOpenSession: (sessionId: string) => void
  /** Read full session projections for the preview (turn/step stats). */
  readonly onInspectSession: (sessionId: string) => Promise<void>
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
  sessionEnabled, sessionOptions, sessionChips, onLinkSessions, onOpenSession, onInspectSession,
}: TaskCardProps): ReactElement {
  const titleRef = useRef<HTMLTextAreaElement | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)
  const [editing, setEditing] = useState<EditableField | null>(null)
  const [editingDue, setEditingDue] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false)
  const [sessionQuery, setSessionQuery] = useState('')
  const sessionAnchorRef = useRef<HTMLButtonElement | null>(null)
  const sessionPanelRef = useRef<HTMLDivElement | null>(null)
  const sessionPanelStyle = useAnchoredPanel({
    open: sessionPickerOpen && sessionEnabled,
    anchorRef: sessionAnchorRef,
    panelRef: sessionPanelRef,
  })
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const previewChip = previewId === null
    ? undefined
    : sessionChips.find(chip => chip.id === previewId) ?? sessionOptions.find(chip => chip.id === previewId)

  const remaining = task.due === undefined ? undefined : daysUntil(task.due.date)
  const overdue = remaining !== undefined && remaining < 0
  const dueSoon = remaining !== undefined && remaining >= 0 && remaining <= 1
  const canArchive = task.status === 'done'
  // Stacked swatch: current colour on top, two palette neighbours peeking out behind, so the
  // control reads as "there are more colours" without a separate palette row.
  const colorIndex = NOTE_COLORS.indexOf(task.color)
  const behindColors = [2, 1].map(offset => NOTE_COLORS[(colorIndex + offset) % NOTE_COLORS.length])

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

  // Session picker: same dismissal rules as the colour palette.
  useEffect(() => {
    if (!sessionPickerOpen) return
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Element
        && (target.closest('.dsh-task-session-pop') !== null || target.closest('[data-session-anchor]') !== null)) return
      setSessionPickerOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setSessionPickerOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [sessionPickerOpen])

  // The projection read resolves asynchronously; stop the loading hint once stats land.
  useEffect(() => {
    if (previewChip?.turns !== undefined || previewChip?.steps !== undefined) setPreviewLoading(false)
  }, [previewChip?.steps, previewChip?.turns])

  const sessionStatusText = (chip: SessionChipInfo): string => {
    if (chip.availability === 'available') return chip.running ? t('task.session.running') : t('task.session.idle')
    if (chip.availability === 'loading') return t('task.session.loading')
    if (chip.availability === 'archived') return t('task.session.archived')
    return t('task.session.unavailable')
  }

  const lastRunText = (chip: SessionChipInfo): string => {
    if (chip.updatedAt <= 0) return t('task.session.preview.never')
    const minutes = Math.max(0, Math.floor((Date.now() - chip.updatedAt) / 60_000))
    if (minutes < 1) return t('task.session.preview.justNow')
    if (minutes < 60) return t('task.session.preview.minutesAgo', { count: minutes })
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t('task.session.preview.hoursAgo', { count: hours })
    return t('task.session.preview.daysAgo', { count: Math.floor(hours / 24) })
  }

  /** Inline expansion: click the same chip again to collapse it. */
  const openPreview = (chip: SessionChipInfo): void => {
    if (previewId === chip.id) {
      setPreviewId(null)
      return
    }
    setPreviewId(chip.id)
    setPreviewLoading(chip.turns === undefined && chip.steps === undefined)
    void onInspectSession(chip.id).finally(() => setPreviewLoading(false))
  }

  const toggleSession = (chip: SessionChipInfo): void => {
    const linked = task.sessionIds.includes(chip.id)
    if (!linked && chip.availability === 'unavailable') return
    if (!linked && task.sessionIds.length >= MAX_TASK_SESSIONS) return
    onLinkSessions(linked
      ? task.sessionIds.filter(id => id !== chip.id)
      : [...task.sessionIds, chip.id])
  }

  const sessionSearch = sessionQuery.trim().toLowerCase()
  const visibleSessionOptions = sessionOptions.filter(option =>
    sessionSearch === '' || option.title.toLowerCase().includes(sessionSearch))

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
      {(sessionEnabled || sessionChips.length > 0)
        ? (
            <div className="dsh-task-sessions">
              {sessionChips.length === 0
                ? null
                : (
                    <div className="dsh-task-session-chips">
                      {sessionChips.map(chip => (
                <span
                  key={chip.id}
                  className="dsh-task-session"
                  data-state={chip.availability === 'available' ? (chip.running ? 'running' : 'idle') : chip.availability}
                >
                        <button
                    type="button"
                    className="dsh-task-session-title"
                    title={`${chip.title} · ${sessionStatusText(chip)}`}
                    onClick={() => openPreview(chip)}
                  >
                    {chip.title}
                  </button>
                  <button
                    type="button"
                    className="dsh-task-session-remove"
                    aria-label={t('task.session.remove')}
                    title={t('task.session.remove')}
                    onClick={() => onLinkSessions(task.sessionIds.filter(id => id !== chip.id))}
                  >
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
                      <path d="M3 3l6 6M9 3L3 9" />
                    </svg>
                  </button>
                </span>
                      ))}
                    </div>
                  )}
              {previewChip === undefined
                ? null
                : (
                    <div
                      className="dsh-task-session-preview"
                      role="region"
                      aria-label={`${previewChip.title} · ${sessionStatusText(previewChip)}`}
                    >
                      <span className="dsh-task-session-preview-stat">
                        <span className="dsh-task-session-preview-label">{t('task.session.preview.lastRun')}</span>
                        <b>{lastRunText(previewChip)}</b>
                      </span>
                      <span className="dsh-task-session-preview-stat">
                        <span className="dsh-task-session-preview-label">{t('task.session.preview.turns')}</span>
                        <b>{previewChip.turns ?? (previewLoading ? t('task.session.preview.reading') : '—')}</b>
                      </span>
                      <span className="dsh-task-session-preview-stat">
                        <span className="dsh-task-session-preview-label">{t('task.session.preview.steps')}</span>
                        <b>{previewChip.steps ?? (previewLoading ? t('task.session.preview.reading') : '—')}</b>
                      </span>
                      <button
                        type="button"
                        className="dsh-task-session-preview-enter"
                        disabled={previewChip.availability !== 'available'}
                        aria-label={t('task.session.preview.open')}
                        title={t('task.session.preview.open')}
                        onClick={() => {
                          onOpenSession(previewChip.id)
                          setPreviewId(null)
                        }}
                      >
                        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M4.5 10h11M11 5.5l4.5 4.5-4.5 4.5" />
                        </svg>
                      </button>
                    </div>
                  )}
              {sessionEnabled
                ? (
                    <div className="dsh-task-session-addrow">
                      <button
                      ref={sessionAnchorRef}
                      type="button"
                      className="dsh-task-session-add"
                      data-session-anchor="true"
                      aria-label={t('task.session.add')}
                      aria-expanded={sessionPickerOpen}
                      title={t('task.session.add')}
                      onClick={() => {
                        setSessionPickerOpen(open => !open)
                        setSessionQuery('')
                      }}
                    >
                      @
                    </button>
                    </div>
                  )
                : null}
            </div>
          )
        : null}
      {sessionPickerOpen && sessionEnabled
        ? createPortal(
            // Body portal: the lane is a scroll container, so an in-card popover would be
            // clipped and squeezed; the picker needs the full viewport.
            <div
              ref={sessionPanelRef}
              className="dsh-task-session-pop"
              style={sessionPanelStyle ?? { visibility: 'hidden' }}
              aria-label={t('task.session.add')}
            >
              <input
                autoFocus
                className="dsh-task-session-search"
                placeholder={t('task.session.search')}
                value={sessionQuery}
                onChange={event => setSessionQuery(event.currentTarget.value)}
              />
              {visibleSessionOptions.length === 0
                ? <p className="dsh-task-session-empty">{t('task.session.empty')}</p>
                : (
                    <ul className="dsh-task-session-list">
                      {visibleSessionOptions.map(option => {
                        const linked = task.sessionIds.includes(option.id)
                        const disabled = !linked
                          && (option.availability === 'unavailable' || task.sessionIds.length >= MAX_TASK_SESSIONS)
                        return (
                          <li key={option.id}>
                            <button
                              type="button"
                              className="dsh-task-session-option"
                              aria-pressed={linked}
                              disabled={disabled}
                              data-state={option.availability === 'available' ? (option.running ? 'running' : 'idle') : option.availability}
                              onClick={() => toggleSession(option)}
                            >
                                                <span className="dsh-task-session-option-title">{option.title}</span>
                              <span className="dsh-task-session-option-state">{sessionStatusText(option)}</span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
            </div>,
            document.body,
          )
        : null}
      <div className="dsh-task-foot">
        <button
          type="button"
          className="dsh-task-color"
          data-color-anchor="true"
          aria-label={t('task.color')}
          aria-haspopup="true"
          aria-expanded={paletteOpen}
          title={t('task.color')}
          onClick={() => setPaletteOpen(open => !open)}
        >
          {behindColors.map((color, position) => (
            <span
              key={color}
              className="dsh-task-color-layer"
              data-color={color}
              data-depth={position === 0 ? 2 : 1}
              aria-hidden="true"
            />
          ))}
          <span className="dsh-task-color-layer" data-color={task.color} data-depth={0} aria-hidden="true" />
        </button>
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
                data-set={task.due !== undefined}
                data-overdue={overdue}
                data-soon={dueSoon}
                aria-label={task.due === undefined ? t('task.setDue') : `${t('task.due')}: ${task.due.date}`}
                title={task.due === undefined ? t('task.setDue') : `${t('task.due')}: ${task.due.date}`}
                onClick={() => setEditingDue(true)}
              >
                <svg className="dsh-task-due-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
                  <rect x="3.5" y="4.5" width="13" height="12" rx="1.5" />
                  <path d="M3.5 8h13M6.5 3.5v3M13.5 3.5v3" />
                </svg>
                {task.due === undefined ? null : <span className="dsh-task-due-date">{task.due.date}</span>}
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
