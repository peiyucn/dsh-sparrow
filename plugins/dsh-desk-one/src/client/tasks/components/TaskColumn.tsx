/**
 * One board lane: header, ungrouped cards, first-class groups (collapsible, drag-reorderable,
 * and — after confirmation — movable to another lane), draft card and the double-click-to-add
 * surface. The lane collapses to a count-only column below the compact threshold.
 */

import { useEffect, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent, ReactElement } from 'react'
import type { DeskTask, DeskTaskGroup, TaskPatchRequest, TaskStatus } from '../../../contract.js'
import type { DeskTranslator } from '../../app/types.js'
import type { LaneView } from '../types.js'
import type { TaskDraft } from '../hooks/useTaskBoard.js'
import { TaskCard } from './TaskCard.js'

export interface DropTarget {
  readonly status: TaskStatus
  readonly groupId?: string
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
  readonly groupDrag: DeskTaskGroup | null
  readonly t: DeskTranslator
  readonly onAdd: (status: TaskStatus, groupId?: string) => void
  readonly onToggleCollapse: () => void
  readonly onCommitDraft: (title: string) => void
  readonly onCancelDraft: () => void
  readonly onStartDrag: (task: DeskTask, event: ReactPointerEvent<HTMLElement>) => void
  readonly onPatch: (task: DeskTask, patch: TaskPatchRequest) => void
  readonly onArchive: (task: DeskTask) => void
  readonly onDelete: (id: string) => void
  readonly isGroupCollapsed: (groupId: string) => boolean
  readonly onToggleGroup: (groupId: string) => void
  readonly onCreateGroup: (status: TaskStatus, name: string) => void
  readonly onRenameGroup: (group: DeskTaskGroup, name: string) => void
  readonly onRemoveGroup: (group: DeskTaskGroup) => void
  readonly onGroupDragStart: (group: DeskTaskGroup) => void
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
  const [confirmGroup, setConfirmGroup] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [groupDragOver, setGroupDragOver] = useState(false)
  const laneOver = dropTarget?.status === status && dropTarget.groupId === undefined

  // The drag source clears groupDrag on dragend; the target lane must stop highlighting then.
  useEffect(() => {
    if (groupDrag === null) setGroupDragOver(false)
  }, [groupDrag])

  /** Drag the whole group as one unit: the drag image is the group header (name + count). */
  const startGroupDrag = (event: ReactDragEvent<HTMLElement>, group: DeskTaskGroup): void => {
    const transfer = event.dataTransfer
    transfer?.setData('text/plain', group.id)
    const head = (event.currentTarget as HTMLElement).closest<HTMLElement>('.dsh-task-group-head')
    if (head !== null && transfer !== undefined && transfer !== null && typeof transfer.setDragImage === 'function') {
      const ghost = head.cloneNode(true) as HTMLElement
      ghost.classList.add('dsh-task-group-dragimage')
      ghost.style.width = `${head.getBoundingClientRect().width}px`
      document.body.appendChild(ghost)
      transfer.setDragImage(ghost, 14, 12)
      window.setTimeout(() => ghost.remove(), 0)
    }
    onGroupDragStart(group)
  }
  const draftIn = (groupId?: string): boolean => draft !== null && draft.status === status && draft.groupId === groupId
  const total = lane.ungrouped.length + lane.groups.reduce((sum, group) => sum + group.tasks.length, 0)
  /** Counts read as labels ("3 tasks") instead of bare numbers — singular handled separately. */
  const countText = (count: number): string => count === 1 ? t('task.countOne') : t('task.count', { count })

  /** Double-click on empty lane / group body adds a card in that place (cards keep their gestures). */
  const handleDoubleClick = (event: React.MouseEvent<HTMLElement>): void => {
    const target = event.target as HTMLElement
    if (target.closest('[data-task-id],input,textarea,button')) return
    const groupZone = target.closest<HTMLElement>('[data-group-id]')
    const groupId = groupZone?.dataset.groupId
    onAdd(status, groupId === undefined || groupId === '' ? undefined : groupId)
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

  /** Group headers accept drops from any lane; the board decides reorder vs confirmed move. */
  const handleGroupDragOver = (event: ReactDragEvent<HTMLElement>, index: number): void => {
    if (groupDrag === null) return
    // Stop the lane-level handlers: a drop on a group must not also append to the lane end.
    event.preventDefault()
    event.stopPropagation()
    setDropIndex(index)
  }

  const header = (
    <header className="dsh-task-lane-head">
      <span className="dsh-task-lane-title">{title}</span>
      <span className="dsh-task-count">{countText(total)}</span>
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
              <span className="dsh-task-compact-count">{countText(lane.ungrouped.length)}</span>
            </div>
          )}
          {lane.groups.map(({ group, tasks }) => (
            <div key={group.id} className="dsh-task-compact-row">
              <span className="dsh-task-compact-name">{group.name}</span>
              <span className="dsh-task-compact-count">{countText(tasks.length)}</span>
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
      data-over={laneOver || groupDragOver}
      data-collapsed={collapsed}
      onDragOver={(event) => {
        if (groupDrag === null) return
        event.preventDefault()
        setGroupDragOver(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setGroupDragOver(false)
      }}
      onDrop={(event) => {
        // Lane header / empty compact area: append at the end. Drops inside the list are handled
        // by the list/group handlers (which stop propagation), so this is only a fallback.
        if (groupDrag === null) return
        const target = event.target as HTMLElement
        if (target.closest('.dsh-task-list') !== null) return
        event.preventDefault()
        setGroupDragOver(false)
        onGroupDrop(status, lane.groups.length)
      }}
    >
      {header}
      <div
        className="dsh-task-list"
        onDoubleClick={handleDoubleClick}
        onDragOver={(event) => {
          if (groupDrag === null) return
          event.preventDefault()
          setDropIndex(lane.groups.length)
        }}
        onDrop={(event) => {
          if (groupDrag === null) return
          event.preventDefault()
          onGroupDrop(status, lane.groups.length)
          setDropIndex(null)
        }}
      >
        <div className="dsh-task-ungrouped" data-group-id="">
          {cards(lane.ungrouped)}
          {draftIn(undefined) ? <DraftCard t={t} onCommit={onCommitDraft} onCancel={onCancelDraft} /> : null}
          {lane.ungrouped.length === 0 && lane.groups.length > 0 && dropTarget?.status === status && dropTarget.groupId === undefined
            ? <p className="dsh-task-ungrouped-hint">{t('task.group.ungroupedHint')}</p>
            : null}
        </div>
        {lane.groups.map(({ group, tasks }, index) => {
          const groupCollapsed = isGroupCollapsed(group.id)
          const over = dropTarget?.status === status && dropTarget.groupId === group.id
          const draggingThis = groupDrag?.id === group.id
          return (
            <div
              key={group.id}
              className="dsh-task-group"
              data-over={over}
              data-drop={dropIndex === index}
              data-dragging={draggingThis}
              onDragOver={(event) => handleGroupDragOver(event, index)}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropIndex(null)
              }}
              onDrop={(event) => {
                if (groupDrag === null) return
                event.preventDefault()
                event.stopPropagation()
                onGroupDrop(status, index)
                setDropIndex(null)
              }}
            >
              <div className="dsh-task-group-head" data-group-id={group.id}>
                <span
                  className="dsh-task-group-grip"
                  draggable
                  title={t('task.group.drag')}
                  onDragStart={(event) => startGroupDrag(event, group)}
                  onDragEnd={onGroupDragEnd}
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
                  onClick={() => onToggleGroup(group.id)}
                >
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                    {groupCollapsed ? <path d="M7 8l3 3 3-3" /> : <path d="M7 11l3-3 3 3" />}
                  </svg>
                </button>
                {editingGroup === group.id
                  ? (
                      <input
                        className="dsh-task-group-input"
                        defaultValue={group.name}
                        autoFocus
                        onBlur={(event) => {
                          setEditingGroup(null)
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
                      <button
                        type="button"
                        className="dsh-task-group-name"
                        title={t('task.group.rename')}
                        onDoubleClick={() => setEditingGroup(group.id)}
                      >
                        {group.name}
                      </button>
                    )}
                <span className="dsh-task-count">{countText(tasks.length)}</span>
                <div className="dsh-task-group-actions">
                  <button
                    type="button"
                    className="dsh-desk-iconbtn dsh-desk-iconbtn-sm"
                    aria-label={t('task.add')}
                    title={t('task.add')}
                    onClick={() => onAdd(status, group.id)}
                  >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                      <path d="M10 4.5v11M4.5 10h11" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="dsh-desk-iconbtn dsh-desk-iconbtn-sm dsh-desk-iconbtn-danger"
                    data-confirm={confirmGroup === group.id}
                    aria-label={confirmGroup === group.id ? t('task.group.removeConfirm') : t('task.group.remove')}
                    title={confirmGroup === group.id ? t('task.group.removeConfirm') : t('task.group.remove')}
                    onClick={() => {
                      if (confirmGroup === group.id) onRemoveGroup(group)
                      else setConfirmGroup(group.id)
                    }}
                    onBlur={() => setConfirmGroup(null)}
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
                    <div className="dsh-task-group-body" data-group-id={group.id}>
                      {cards(tasks)}
                      {draftIn(group.id) ? <DraftCard t={t} onCommit={onCommitDraft} onCancel={onCancelDraft} /> : null}
                      {tasks.length === 0 && !draftIn(group.id)
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
