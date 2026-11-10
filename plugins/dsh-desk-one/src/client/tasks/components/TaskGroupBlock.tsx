/** One collapsible task group inside a lane, holding its cards and drop target. */

import { useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react'
import type { DeskTask, DeskTaskGroup, TaskStatus } from '../../../contract.js'
import type { DeskTranslator } from '../../app/types.js'
import { TaskDraftCard } from './TaskDraftCard.js'

interface TaskGroupBlockProps {
  readonly group: DeskTaskGroup
  readonly tasks: readonly DeskTask[]
  readonly status: TaskStatus
  readonly countLabel: string
  readonly collapsed: boolean
  readonly over: boolean
  readonly dragging: boolean
  /** Card insertion index inside this group, or null when another target is active. */
  readonly dropIndex: number | null
  readonly draft: boolean
  readonly t: DeskTranslator
  readonly renderTask: (task: DeskTask) => ReactElement
  readonly onStartDrag: (group: DeskTaskGroup, event: ReactPointerEvent<HTMLElement>) => void
  readonly onToggleGroup: (groupId: string) => void
  readonly onRenameGroup: (group: DeskTaskGroup, name: string) => void
  readonly onAdd: (status: TaskStatus, groupId?: string) => void
  readonly onRemoveGroup: (group: DeskTaskGroup) => void
  readonly onArchiveGroup: (group: DeskTaskGroup) => void
  readonly onCommitDraft: (title: string) => void
  readonly onCancelDraft: () => void
}

/**
 * One group as a lane block: two-row header (name + count) plus its card list. The drag gesture
 * starts from the header; cards inside keep their own drag handlers.
 */
export function TaskGroupBlock({
  group, tasks, status, countLabel, collapsed, over, dragging, dropIndex, draft, t,
  renderTask, onStartDrag, onToggleGroup, onRenameGroup, onAdd, onRemoveGroup, onArchiveGroup,
  onCommitDraft, onCancelDraft,
}: TaskGroupBlockProps): ReactElement {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const cardNodes: ReactElement[] = []
  tasks.forEach((task, position) => {
    if (dropIndex === position) {
      cardNodes.push(<div key={`drop-${position}`} className="dsh-task-card-dropmark" data-active="true" />)
    }
    cardNodes.push(renderTask(task))
  })
  if (dropIndex === tasks.length) {
    cardNodes.push(<div key="drop-end" className="dsh-task-card-dropmark" data-active="true" />)
  }

  return (
    <div
      className="dsh-task-group"
      data-group-id={group.id}
      data-over={over}
      data-dragging={dragging}
    >
      <div
        className="dsh-task-group-head"
        data-group-id={group.id}
        onPointerDown={(event) => onStartDrag(group, event)}
      >
        <span className="dsh-task-group-grip" title={t('task.group.drag')} aria-hidden="true">
          <svg viewBox="0 0 10 16" fill="currentColor">
            <circle cx="3" cy="3" r="1" /><circle cx="7" cy="3" r="1" />
            <circle cx="3" cy="8" r="1" /><circle cx="7" cy="8" r="1" />
            <circle cx="3" cy="13" r="1" /><circle cx="7" cy="13" r="1" />
          </svg>
        </span>
        <button
          type="button"
          className="dsh-task-add"
          aria-label={collapsed ? t('task.group.expand') : t('task.group.collapse')}
          title={collapsed ? t('task.group.expand') : t('task.group.collapse')}
          onClick={() => onToggleGroup(group.id)}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            {collapsed ? <path d="M7 8l3 3 3-3" /> : <path d="M7 11l3-3 3 3" />}
          </svg>
        </button>
        <div className="dsh-task-group-main">
          <div className="dsh-task-group-title">
            {editing
              ? (
                  <input
                    className="dsh-task-group-input"
                    defaultValue={group.name}
                    autoFocus
                    onPointerDown={event => event.stopPropagation()}
                    onBlur={(event) => {
                      setEditing(false)
                      onRenameGroup(group, event.currentTarget.value)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                      if (event.key === 'Escape') {
                        event.currentTarget.value = group.name
                        event.currentTarget.blur()
                      }
                    }}
                  />
                )
              : (
                  <span
                    className="dsh-task-group-name"
                    role="button"
                    tabIndex={0}
                    title={t('task.group.rename')}
                    onDoubleClick={() => setEditing(true)}
                  >
                    {group.name}
                  </span>
                )}
          </div>
          <div className="dsh-task-group-meta">
            <span className="dsh-task-count">{countLabel}</span>
          </div>
        </div>
        <div className="dsh-task-group-actions">
          <button
            type="button"
            className="dsh-desk-iconbtn dsh-desk-iconbtn-sm"
            aria-label={t('task.add')}
            title={t('task.add')}
            onClick={() => onAdd(status, group.id)}
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M10 4.5v11M4.5 10h11" />
            </svg>
          </button>
          {status === 'done'
            ? (
                <button
                  type="button"
                  className="dsh-desk-iconbtn dsh-desk-iconbtn-sm"
                  aria-label={t('task.group.archive')}
                  title={t('task.group.archive')}
                  onClick={() => onArchiveGroup(group)}
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
            data-confirm={confirming}
            aria-label={confirming ? t('task.group.removeConfirm') : t('task.group.remove')}
            title={confirming ? t('task.group.removeConfirm') : t('task.group.remove')}
            onClick={() => {
              if (confirming) onRemoveGroup(group)
              else setConfirming(true)
            }}
            onBlur={() => setConfirming(false)}
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6.5h12M8 6.5V5h4v1.5M6 6.5l.7 8.5h6.6l.7-8.5M8.5 9v4M11.5 9v4" />
            </svg>
          </button>
        </div>
      </div>
      {collapsed
        ? null
        : (
            <div
              className="dsh-task-group-body"
              data-group-id={group.id}
              onDoubleClick={(event) => {
                const target = event.target as HTMLElement
                if (target.closest('[data-task-id],input,textarea,button')) return
                // The lane-level double-click handler ignores block descendants; handle the group
                // body here so "double-click to add" creates a card inside THIS group.
                event.stopPropagation()
                onAdd(status, group.id)
              }}
            >
              {cardNodes}
              {draft ? <TaskDraftCard t={t} onCommit={onCommitDraft} onCancel={onCancelDraft} /> : null}
              {tasks.length === 0 && !draft
                ? <p className="dsh-task-group-empty">{t('task.group.dropHint')}</p>
                : null}
            </div>
          )}
    </div>
  )
}
