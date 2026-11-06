/**
 * One board lane: header, ungrouped cards, first-class groups (collapsible, draggable as a unit)
 * plus the double-click-to-add surface. Below the compact threshold the lane collapses to a
 * count-only column.
 */

import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react'
import type { DeskTask, DeskTaskGroup, TaskPatchRequest, TaskStatus } from '../../../contract.js'
import type { DeskTranslator } from '../../app/types.js'
import type { LaneView } from '../types.js'
import type { TaskDraft } from '../hooks/useTaskBoard.js'
import { TaskCard } from './TaskCard.js'

export interface DropTarget {
  readonly status: TaskStatus
  readonly groupId?: string
  /** Insertion position inside the target container (0..n). */
  readonly index: number
}

/** Group drag target: which lane, and the insertion position among that lane's groups. */
export interface GroupDropTarget {
  readonly status: TaskStatus
  readonly index: number
}

interface TaskColumnProps {
  readonly status: TaskStatus
  readonly title: string
  readonly lane: LaneView
  readonly compact: boolean
  readonly collapsed: boolean
  readonly draft: TaskDraft | null
  readonly dropTarget: DropTarget | null
  readonly groupDrop: GroupDropTarget | null
  readonly draggingId: string | null
  readonly groupDrag: DeskTaskGroup | null
  readonly t: DeskTranslator
  readonly onAdd: (status: TaskStatus, groupId?: string) => void
  readonly onToggleCollapse: () => void
  readonly onCommitDraft: (title: string) => void
  readonly onCancelDraft: () => void
  readonly onStartDrag: (task: DeskTask, event: ReactPointerEvent<HTMLElement>) => void
  readonly onGroupStartDrag: (group: DeskTaskGroup, event: ReactPointerEvent<HTMLElement>) => void
  readonly onPatch: (task: DeskTask, patch: TaskPatchRequest) => void
  readonly onArchive: (task: DeskTask) => void
  readonly onDelete: (id: string) => void
  readonly isGroupCollapsed: (groupId: string) => boolean
  readonly onToggleGroup: (groupId: string) => void
  readonly onCreateGroup: (status: TaskStatus, name: string) => void
  readonly onRenameGroup: (group: DeskTaskGroup, name: string) => void
  readonly onRemoveGroup: (group: DeskTaskGroup) => void
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
  status, title, lane, compact, collapsed, draft, dropTarget, groupDrop, draggingId, groupDrag, t,
  onAdd, onToggleCollapse, onCommitDraft, onCancelDraft, onStartDrag, onGroupStartDrag,
  onPatch, onArchive, onDelete,
  isGroupCollapsed, onToggleGroup, onCreateGroup, onRenameGroup, onRemoveGroup,
}: TaskColumnProps): ReactElement {
  const [addingGroup, setAddingGroup] = useState(false)
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [confirmGroup, setConfirmGroup] = useState<string | null>(null)
  const laneOver = dropTarget?.status === status && dropTarget.groupId === undefined
  const groupLaneOver = groupDrop?.status === status
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

  const cards = (tasks: readonly DeskTask[], dropIndex: number | null): ReactElement[] => {
    const nodes: ReactElement[] = []
    tasks.forEach((task, position) => {
      if (dropIndex === position) nodes.push(<div key={`drop-${position}`} className="dsh-task-card-dropmark" data-active="true" />)
      nodes.push(
        <TaskCard
          key={task.id}
          task={task}
          dragging={draggingId === task.id}
          t={t}
          onStartDrag={onStartDrag}
          onPatch={onPatch}
          onArchive={onArchive}
          onDelete={onDelete}
        />,
      )
    })
    if (dropIndex === tasks.length) nodes.push(<div key="drop-end" className="dsh-task-card-dropmark" data-active="true" />)
    return nodes
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
      data-over={laneOver || groupLaneOver}
      data-collapsed={collapsed}
    >
      {header}
      <div className="dsh-task-list" onDoubleClick={handleDoubleClick}>
        <div className="dsh-task-ungrouped" data-group-id="">
          {cards(lane.ungrouped, dropTarget?.status === status && dropTarget.groupId === undefined ? dropTarget.index : null)}
          {draftIn(undefined) ? <DraftCard t={t} onCommit={onCommitDraft} onCancel={onCancelDraft} /> : null}
          {lane.ungrouped.length === 0 && lane.groups.length > 0 && dropTarget?.status === status && dropTarget.groupId === undefined
            ? <p className="dsh-task-ungrouped-hint">{t('task.group.ungroupedHint')}</p>
            : null}
        </div>
        {lane.groups.map(({ group, tasks }, index) => {
          const groupCollapsed = isGroupCollapsed(group.id)
          const draggingThis = groupDrag?.id === group.id
          const groupOver = dropTarget?.status === status && dropTarget.groupId === group.id
          return (
            <div
              key={group.id}
              className="dsh-task-group"
              data-over={groupOver}
              data-drop={groupLaneOver && groupDrop?.index === index}
              data-dragging={draggingThis}
            >
              <div
                className="dsh-task-group-head"
                data-group-id={group.id}
                onPointerDown={(event) => onGroupStartDrag(group, event)}
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
                        onPointerDown={event => event.stopPropagation()}
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
                      <span
                        className="dsh-task-group-name"
                        role="button"
                        tabIndex={0}
                        title={t('task.group.rename')}
                        onDoubleClick={() => setEditingGroup(group.id)}
                      >
                        {group.name}
                      </span>
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
                      {cards(tasks, groupOver ? dropTarget.index : null)}
                      {draftIn(group.id) ? <DraftCard t={t} onCommit={onCommitDraft} onCancel={onCancelDraft} /> : null}
                      {tasks.length === 0 && !draftIn(group.id)
                        ? <p className="dsh-task-group-empty">{t('task.group.dropHint')}</p>
                        : null}
                    </div>
                  )}
            </div>
          )
        })}
        <div className="dsh-task-group-dropmark" data-active={groupLaneOver && groupDrop?.index === lane.groups.length} />
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
