/**
 * One board lane: header (name, count, add button, done collapse), draft input and cards.
 * The lane element carries `data-lane`, which the drag controller uses to find the drop target.
 */

import { useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react'
import type { DeskTask, TaskPatchRequest, TaskStatus } from '../../../contract.js'
import type { DeskTranslator } from '../../app/types.js'
import { TaskCard } from './TaskCard.js'

interface TaskColumnProps {
  readonly status: TaskStatus
  readonly title: string
  readonly tasks: readonly DeskTask[]
  readonly collapsed: boolean
  readonly draft: boolean
  readonly dragOver: boolean
  readonly draggingId: string | null
  readonly t: DeskTranslator
  readonly onAdd: (status: TaskStatus) => void
  readonly onToggleCollapse: () => void
  readonly onCommitDraft: (status: TaskStatus, title: string) => void
  readonly onCancelDraft: () => void
  readonly onStartDrag: (task: DeskTask, event: ReactPointerEvent<HTMLElement>) => void
  readonly onPatch: (task: DeskTask, patch: TaskPatchRequest) => void
  readonly onArchive: (task: DeskTask) => void
  readonly onDelete: (id: string) => void
}

/** Inline draft: an empty title just cancels instead of creating an empty task (titles are required). */
function DraftCard({ status, t, onCommit, onCancel }: {
  readonly status: TaskStatus
  readonly t: DeskTranslator
  readonly onCommit: (status: TaskStatus, title: string) => void
  readonly onCancel: () => void
}): ReactElement {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const done = useRef(false)
  const finish = (value: string): void => {
    if (done.current) return
    done.current = true
    onCommit(status, value)
  }
  return (
    <div className="dsh-task-draft">
      <input
        ref={inputRef}
        autoFocus
        className="dsh-task-title"
        placeholder={t('task.placeholder')}
        spellCheck={false}
        onBlur={event => finish(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') finish(event.currentTarget.value)
          if (event.key === 'Escape') {
            done.current = true
            onCancel()
          }
        }}
      />
    </div>
  )
}

export function TaskColumn({
  status, title, tasks, collapsed, draft, dragOver, draggingId, t,
  onAdd, onToggleCollapse, onCommitDraft, onCancelDraft, onStartDrag, onPatch, onArchive, onDelete,
}: TaskColumnProps): ReactElement {
  return (
    <section
      className="dsh-task-lane"
      data-lane={status}
      data-over={dragOver}
      data-collapsed={collapsed}
    >
      <header className="dsh-task-lane-head">
        <span className="dsh-task-lane-title">{title}</span>
        <span className="dsh-task-count">{tasks.length}</span>
        {status === 'done'
          ? (
              <button
                type="button"
                className="dsh-task-add"
                aria-label={collapsed ? t('task.expand') : t('task.collapse')}
                title={collapsed ? t('task.expand') : t('task.collapse')}
                onClick={onToggleCollapse}
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                  {collapsed ? <path d="M6 8l4 4 4-4" /> : <path d="M6 12l4-4 4 4" />}
                </svg>
              </button>
            )
          : null}
        <button
          type="button"
          className="dsh-task-add"
          aria-label={t('task.add')}
          title={t('task.add')}
          onClick={() => onAdd(status)}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d="M10 4.5v11M4.5 10h11" />
          </svg>
        </button>
      </header>
      <div className="dsh-task-list">
        {draft ? <DraftCard status={status} t={t} onCommit={onCommitDraft} onCancel={onCancelDraft} /> : null}
        {tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            dragging={draggingId === task.id}
            t={t}
            onStartDrag={onStartDrag}
            onPatch={onPatch}
            onArchive={onArchive}
            onDelete={onDelete}
          />
        ))}
        {tasks.length === 0 && !draft ? <p className="dsh-task-empty">{t('task.emptyLane')}</p> : null}
      </div>
    </section>
  )
}
