/**
 * One board lane: header, ungrouped cards, one-level groups (collapsible, drag-reorderable),
 * draft card and the double-click-to-add surface.
 *
 * When the board is narrower than the compact threshold the lane collapses to a count-only
 * column (title + per-group counts) instead of introducing a horizontal scrollbar.
 */

import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react'
import type { DeskTask, TaskPatchRequest, TaskStatus } from '../../../contract.js'
import type { DeskTranslator } from '../../app/types.js'
import type { LaneView } from '../types.js'
import type { TaskDraft } from '../hooks/useTaskBoard.js'
import { TaskCard } from './TaskCard.js'

export interface DropTarget {
  readonly status: TaskStatus
  readonly group?: string
}

interface TaskColumnProps {
  readonly status: TaskStatus
  readonly title: string
  readonly lane: LaneView
  readonly compact: boolean
  readonly collapsed: boolean
  readonly draft: TaskDraft | null
  readonly dropTarget: DropTarget | null
  readonly draggingId: string | null
  readonly groupDrag: { readonly status: TaskStatus; readonly name: string } | null
  readonly t: DeskTranslator
  readonly onAdd: (status: TaskStatus, group?: string) => void
  readonly onToggleCollapse: () => void
  readonly onCommitDraft: (title: string) => void
  readonly onCancelDraft: () => void
  readonly onStartDrag: (task: DeskTask, event: ReactPointerEvent<HTMLElement>) => void
  readonly onPatch: (task: DeskTask, patch: TaskPatchRequest) => void
  readonly onArchive: (task: DeskTask) => void
  readonly onDelete: (id: string) => void
  readonly isGroupCollapsed: (status: TaskStatus, name: string) => boolean
  readonly onToggleGroup: (status: TaskStatus, name: string) => void
  readonly onCreateGroup: (status: TaskStatus, name: string) => void
  readonly onRenameGroup: (status: TaskStatus, from: string, to: string) => void
  readonly onRemoveGroup: (status: TaskStatus, name: string) => void
  readonly onGroupDragStart: (status: TaskStatus, name: string) => void
  readonly onGroupDragEnd: () => void
  readonly onGroupDrop: (status: TaskStatus, toIndex: number) => void
}

/** Inline draft: an empty title cancels instead of creating an empty task (titles are required). */
function DraftCard({ t, onCommit, onCancel }: {
  readonly t: DeskTranslator
  readonly onCommit: (title: string) => void
  readonly onCancel: () => void
}): ReactElement {
  const done = useRef(false)
  const finish = (value: string): void => {
    if (done.current) return
    done.current = true
    onCommit(value)
  }
  return (
    <div className="dsh-task-draft">
      <textarea
        autoFocus
        rows={1}
        className="dsh-task-title"
        placeholder={t('task.placeholder')}
        spellCheck={false}
        onBlur={event => finish(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            finish(event.currentTarget.value)
          }
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
  status, title, lane, compact, collapsed, draft, dropTarget, draggingId, groupDrag, t,
  onAdd, onToggleCollapse, onCommitDraft, onCancelDraft, onStartDrag, onPatch, onArchive, onDelete,
  isGroupCollapsed, onToggleGroup, onCreateGroup, onRenameGroup, onRemoveGroup,
  onGroupDragStart, onGroupDragEnd, onGroupDrop,
}: TaskColumnProps): ReactElement {
  const [addingGroup, setAddingGroup] = useState(false)
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const laneOver = dropTarget?.status === status && dropTarget.group === undefined
  const draftIn = (group?: string): boolean => draft !== null && draft.status === status && draft.group === group
  const total = lane.ungrouped.length + lane.groups.reduce((sum, group) => sum + group.tasks.length, 0)

  /** Double-click on empty lane / group body adds a card in that place (cards keep their gestures). */
  const handleDoubleClick = (event: React.MouseEvent<HTMLElement>): void => {
    const target = event.target as HTMLElement
    if (target.closest('[data-task-id],input,textarea,button')) return
    const groupZone = target.closest<HTMLElement>('[data-group-drop]')
    const groupName = groupZone?.dataset.groupDrop
    onAdd(status, groupName === undefined || groupName === '' ? undefined : groupName)
  }

  const cards = (tasks: readonly DeskTask[]): ReactElement[] => tasks.map(task => (
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
  ))

  const header = (
    <header className="dsh-task-lane-head">
      <span className="dsh-task-lane-title">{title}</span>
      <span className="dsh-task-count">{total}</span>
      {compact ? null : (
        <>
          <button
            type="button"
            className="dsh-task-add"
            aria-label={t('task.group.add')}
            title={t('task.group.add')}
            onClick={() => setAddingGroup(true)}
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M2.8 6.2h5l1.4 1.6h8v7.4H2.8zM2.8 6.2V4.8h5" />
            </svg>
          </button>
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
        </>
      )}
    </header>
  )

  if (compact) {
    return (
      <section className="dsh-task-lane" data-lane={status} data-compact="true">
        {header}
        <div className="dsh-task-compact">
          {lane.ungrouped.length === 0 ? null : (
            <div className="dsh-task-compact-row">
              <span className="dsh-task-compact-name">{t('task.ungrouped')}</span>
              <span className="dsh-task-compact-count">{lane.ungrouped.length}</span>
            </div>
          )}
          {lane.groups.map(group => (
            <div key={group.name} className="dsh-task-compact-row">
              <span className="dsh-task-compact-name">{group.name}</span>
              <span className="dsh-task-compact-count">{group.tasks.length}</span>
            </div>
          ))}
          {total === 0 ? <p className="dsh-task-empty">{t('task.emptyLane')}</p> : null}
        </div>
      </section>
    )
  }

  return (
    <section
      className="dsh-task-lane"
      data-lane={status}
      data-over={laneOver}
      data-collapsed={collapsed}
    >
      {header}
      <div className="dsh-task-list" onDoubleClick={handleDoubleClick}>
        <div className="dsh-task-ungrouped" data-group-drop="">
          {cards(lane.ungrouped)}
          {draftIn(undefined) ? <DraftCard t={t} onCommit={onCommitDraft} onCancel={onCancelDraft} /> : null}
        </div>
        {lane.groups.map((group, index) => {
          const groupCollapsed = isGroupCollapsed(status, group.name)
          const over = dropTarget?.status === status && dropTarget.group === group.name
          const draggingThis = groupDrag !== null && groupDrag.status === status && groupDrag.name === group.name
          return (
            <div
              key={group.name}
              className="dsh-task-group"
              data-over={over}
              data-drop={dropIndex === index}
              data-dragging={draggingThis}
              onDragOver={(event) => {
                if (groupDrag === null || groupDrag.status !== status) return
                event.preventDefault()
                setDropIndex(index)
              }}
              onDragLeave={(event) => {
                // Only clear when the pointer really leaves this group (not when it enters a child).
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropIndex(null)
              }}
              onDrop={(event) => {
                event.preventDefault()
                onGroupDrop(status, index)
                setDropIndex(null)
              }}
            >
              <div className="dsh-task-group-head" data-group-drop={group.name}>
                <span
                  className="dsh-task-group-grip"
                  draggable
                  title={t('task.group.drag')}
                  onDragStart={(event) => {
                    event.dataTransfer?.setData('text/plain', group.name)
                    onGroupDragStart(status, group.name)
                  }}
                  onDragEnd={() => {
                    onGroupDragEnd()
                    setDropIndex(null)
                  }}
                >
                  <svg viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
                    <circle cx="3" cy="3" r="1" /><circle cx="7" cy="3" r="1" />
                    <circle cx="3" cy="8" r="1" /><circle cx="7" cy="8" r="1" />
                    <circle cx="3" cy="13" r="1" /><circle cx="7" cy="13" r="1" />
                  </svg>
                </span>
                <button
                  type="button"
                  className="dsh-task-add"
                  aria-label={groupCollapsed ? t('task.group.expand') : t('task.group.collapse')}
                  title={groupCollapsed ? t('task.group.expand') : t('task.group.collapse')}
                  onClick={() => onToggleGroup(status, group.name)}
                >
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                    {groupCollapsed ? <path d="M7 8l3 3 3-3" /> : <path d="M7 11l3-3 3 3" />}
                  </svg>
                </button>
                {editingGroup === group.name
                  ? (
                      <input
                        className="dsh-task-group-input"
                        defaultValue={group.name}
                        autoFocus
                        onBlur={(event) => {
                          setEditingGroup(null)
                          onRenameGroup(status, group.name, event.currentTarget.value)
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
                      <button
                        type="button"
                        className="dsh-task-group-name"
                        title={t('task.group.rename')}
                        onDoubleClick={() => setEditingGroup(group.name)}
                      >
                        {group.name}
                      </button>
                    )}
                <span className="dsh-task-count">{group.tasks.length}</span>
                <div className="dsh-task-group-actions">
                  <button
                    type="button"
                    className="dsh-desk-iconbtn dsh-desk-iconbtn-sm"
                    aria-label={t('task.add')}
                    title={t('task.add')}
                    onClick={() => onAdd(status, group.name)}
                  >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                      <path d="M10 4.5v11M4.5 10h11" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="dsh-desk-iconbtn dsh-desk-iconbtn-sm"
                    aria-label={t('task.group.remove')}
                    title={t('task.group.remove')}
                    onClick={() => onRemoveGroup(status, group.name)}
                  >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                      <path d="M5 5l10 10M15 5L5 15" />
                    </svg>
                  </button>
                </div>
              </div>
              {groupCollapsed
                ? null
                : (
                    <div className="dsh-task-group-body" data-group-drop={group.name}>
                      {cards(group.tasks)}
                      {draftIn(group.name) ? <DraftCard t={t} onCommit={onCommitDraft} onCancel={onCancelDraft} /> : null}
                      {group.tasks.length === 0 && !draftIn(group.name)
                        ? <p className="dsh-task-group-empty">{t('task.group.dropHint')}</p>
                        : null}
                    </div>
                  )}
            </div>
          )
        })}
        {addingGroup
          ? (
              <div className="dsh-task-group-new">
                <input
                  autoFocus
                  className="dsh-task-group-input"
                  placeholder={t('task.group.namePlaceholder')}
                  onBlur={(event) => {
                    setAddingGroup(false)
                    onCreateGroup(status, event.currentTarget.value)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                    if (event.key === 'Escape') {
                      event.currentTarget.value = ''
                      event.currentTarget.blur()
                    }
                  }}
                />
              </div>
            )
          : null}
        {lane.ungrouped.length === 0 && lane.groups.length === 0 && draft === null && !addingGroup
          ? <p className="dsh-task-empty">{t('task.emptyLane')}</p>
          : null}
      </div>
    </section>
  )
}
