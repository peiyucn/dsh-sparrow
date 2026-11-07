/**
 * One board lane.
 *
 * The lane body is ONE manual block sequence: each ungrouped card and each group is a block, so a
 * group can be dragged to any position among the cards (and vice versa via its own block index).
 * Groups keep their card list; compact lanes still collapse to counts.
 */

import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react'
import type { DeskTask, DeskTaskGroup, TaskPatchRequest, TaskStatus } from '../../../contract.js'
import type { DeskTranslator } from '../../app/types.js'
import type { SessionChipInfo } from '../../sessions/contract.js'
import type { LaneView } from '../types.js'
import type { TaskDraft } from '../hooks/useTaskBoard.js'
import { TaskCard } from './TaskCard.js'

export interface DropTarget {
  readonly status: TaskStatus
  readonly groupId?: string
  /** Card index when `groupId` is set, otherwise a lane block insertion index. */
  readonly index: number
  /** True for a unified block insertion (ungrouped area); false for a group's card list. */
  readonly block?: boolean
}

/** Group drag target: which lane, and the block insertion position. */
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
  readonly blockDrop: GroupDropTarget | null
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
  readonly onArchiveGroup: (group: DeskTaskGroup) => void
  readonly sessionEnabled: boolean
  readonly sessionOptions: readonly SessionChipInfo[]
  readonly sessionsFor: (ids: readonly string[]) => readonly SessionChipInfo[]
  readonly onLinkSessions: (task: DeskTask, sessionIds: readonly string[]) => void
  readonly onOpenSession: (sessionId: string) => void
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
  status, title, lane, compact, collapsed, draft, dropTarget, blockDrop, groupDrop,
  draggingId, groupDrag, t,
  onAdd, onToggleCollapse, onCommitDraft, onCancelDraft, onStartDrag, onGroupStartDrag,
  onPatch, onArchive, onDelete,
  isGroupCollapsed, onToggleGroup, onCreateGroup, onRenameGroup, onRemoveGroup, onArchiveGroup,
  sessionEnabled, sessionOptions, sessionsFor, onLinkSessions, onOpenSession,
}: TaskColumnProps): ReactElement {
  const [addingGroup, setAddingGroup] = useState(false)
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [confirmGroup, setConfirmGroup] = useState<string | null>(null)
  const laneOver = (dropTarget?.status === status && dropTarget.block === true)
    || groupDrop?.status === status
  const draftIn = (groupId?: string): boolean => draft !== null && draft.status === status && draft.groupId === groupId
  const total = lane.blocks.reduce((sum, block) => sum + (block.kind === 'group' ? block.tasks.length : 1), 0)
  const countText = (count: number): string => count === 1 ? t('task.countOne') : t('task.count', { count })

  const card = (task: DeskTask): ReactElement => (
    <TaskCard
      key={task.id}
      task={task}
      dragging={draggingId === task.id}
      t={t}
      onStartDrag={onStartDrag}
      onPatch={onPatch}
      onArchive={onArchive}
      onDelete={onDelete}
      sessionEnabled={sessionEnabled}
      sessionOptions={sessionOptions}
      sessionChips={sessionsFor(task.sessionIds)}
      onLinkSessions={(sessionIds) => onLinkSessions(task, sessionIds)}
      onOpenSession={onOpenSession}
    />
  )

  /** Card list inside a group, with the precise insertion line when the pointer targets it. */
  const cards = (tasks: readonly DeskTask[], dropIndex: number | null): ReactElement[] => {
    const nodes: ReactElement[] = []
    tasks.forEach((task, position) => {
      if (dropIndex === position) nodes.push(<div key={`drop-${position}`} className="dsh-task-card-dropmark" data-active="true" />)
      nodes.push(card(task))
    })
    if (dropIndex === tasks.length) nodes.push(<div key="drop-end" className="dsh-task-card-dropmark" data-active="true" />)
    return nodes
  }

  /** Double-click on empty lane / group body adds a card in that place. */
  const handleDoubleClick = (event: React.MouseEvent<HTMLElement>): void => {
    const target = event.target as HTMLElement
    if (target.closest('[data-task-id],input,textarea,button,[data-block-index]')) return
    onAdd(status)
  }

  const renderGroup = (
    block: Extract<LaneView['blocks'][number], { kind: 'group' }>,
  ): ReactElement => {
    const { group, tasks } = block
    const groupCollapsed = isGroupCollapsed(group.id)
    const groupOver = dropTarget?.status === status && dropTarget.groupId === group.id
    return (
      <div
        className="dsh-task-group"
        data-group-id={group.id}
        data-over={groupOver}
        data-dragging={groupDrag?.id === group.id}
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
          <div className="dsh-task-group-main">
            <div className="dsh-task-group-title">
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
            </div>
            <div className="dsh-task-group-meta">
              <span className="dsh-task-count">{countText(tasks.length)}</span>
            </div>
          </div>
          <div className="dsh-task-group-actions">
            <button
              type="button"
              className="dsh-task-iconbtn"
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
                    className="dsh-task-iconbtn"
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
              className="dsh-task-iconbtn dsh-task-iconbtn-danger"
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
                <path d="M4 6.5h12M8 6.5V5h4v1.5M6 6.5l.7 8.5h6.6l.7-8.5M8.5 9v4M11.5 9v4" />
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

  const dropMarkIndex = groupDrag !== null
    ? lane.blocks.filter(block => !(block.kind === 'group' && block.group.id === groupDrag.id)).length
    : lane.blocks.length

  return (
    <section
      className="dsh-task-lane"
      data-lane={status}
      data-over={laneOver}
      data-collapsed={collapsed}
    >
      {header}
      <div className="dsh-task-list" onDoubleClick={handleDoubleClick}>
        {lane.blocks.map((block, index) => {
          const isDraggedGroup = block.kind === 'group' && groupDrag?.id === block.group.id
          const markerIndex = groupDrag !== null
            ? lane.blocks.slice(0, index).filter(item => !(item.kind === 'group' && item.group.id === groupDrag.id)).length
            : index
          const insertAt = blockDrop?.status === status ? blockDrop.index : groupDrop?.status === status ? groupDrop.index : null
          const activeDrop = !isDraggedGroup && insertAt !== null && insertAt === markerIndex
          return (
            <div
              key={block.kind === 'group' ? `group:${block.group.id}` : `task:${block.task.id}`}
              className="dsh-task-block"
              data-block-index={index}
              data-drop={activeDrop}
            >
              {block.kind === 'group' ? renderGroup(block) : card(block.task)}
            </div>
          )
        })}
        {draftIn(undefined) ? <DraftCard t={t} onCommit={onCommitDraft} onCancel={onCancelDraft} /> : null}
        <div
          className="dsh-task-block-dropend"
          data-active={(blockDrop?.status === status && blockDrop.index === dropMarkIndex)
            || (groupDrop?.status === status && groupDrop.index === dropMarkIndex)}
        />
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
        {lane.blocks.length === 0 && draft === null && !addingGroup
          ? <p className="dsh-task-empty">{t('task.emptyLane')}</p>
          : null}
      </div>
    </section>
  )
}
