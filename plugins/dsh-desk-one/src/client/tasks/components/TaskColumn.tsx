/**
 * One board lane.
 *
 * The lane body is ONE manual block sequence: each ungrouped card and each group is a block, so a
 * group can be dragged to any position among the cards. Group internals live in TaskGroupBlock,
 * the lane header in LaneHeader, and the inline draft in TaskDraftCard.
 */

import { useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react'
import type { DeskTask, DeskTaskGroup, TaskPatchRequest, TaskStatus } from '../../../contract.js'
import type { DeskTranslator } from '../../app/types.js'
import type { SessionChipInfo } from '../../sessions/contract.js'
import type { LaneView } from '../types.js'
import type { TaskDraft } from '../hooks/useTaskBoard.js'
import { LaneHeader } from './LaneHeader.js'
import { TaskCard } from './TaskCard.js'
import { TaskDraftCard } from './TaskDraftCard.js'
import { TaskGroupBlock } from './TaskGroupBlock.js'

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
  readonly onInspectSession: (sessionId: string) => Promise<void>
}

export function TaskColumn({
  status, title, lane, compact, collapsed, draft, dropTarget, blockDrop, groupDrop,
  draggingId, groupDrag, t,
  onAdd, onToggleCollapse, onCommitDraft, onCancelDraft, onStartDrag, onGroupStartDrag,
  onPatch, onArchive, onDelete,
  isGroupCollapsed, onToggleGroup, onCreateGroup, onRenameGroup, onRemoveGroup, onArchiveGroup,
  sessionEnabled, sessionOptions, sessionsFor, onLinkSessions, onOpenSession, onInspectSession,
}: TaskColumnProps): ReactElement {
  const [addingGroup, setAddingGroup] = useState(false)
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
      onInspectSession={onInspectSession}
    />
  )

  /** Double-click on empty lane / group body adds a card in that place. */
  const handleDoubleClick = (event: React.MouseEvent<HTMLElement>): void => {
    const target = event.target as HTMLElement
    if (target.closest('[data-task-id],input,textarea,button,[data-block-index]')) return
    onAdd(status)
  }

  const header = (
    <LaneHeader
      status={status}
      title={title}
      countLabel={countText(total)}
      compact={compact}
      collapsed={collapsed}
      t={t}
      onAdd={onAdd}
      onToggleCollapse={onToggleCollapse}
      onBeginGroup={() => setAddingGroup(true)}
    />
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
  const insertIndex = blockDrop?.status === status ? blockDrop.index : groupDrop?.status === status ? groupDrop.index : null

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
          const activeDrop = !isDraggedGroup && insertIndex !== null && insertIndex === markerIndex
          const groupOver = block.kind === 'group'
            && dropTarget?.status === status
            && dropTarget.groupId === block.group.id
          return (
            <div
              key={block.kind === 'group' ? `group:${block.group.id}` : `task:${block.task.id}`}
              className="dsh-task-block"
              data-block-index={index}
              data-drop={activeDrop}
            >
              {block.kind === 'group'
                ? (
                    <TaskGroupBlock
                      group={block.group}
                      tasks={block.tasks}
                      status={status}
                      countLabel={countText(block.tasks.length)}
                      collapsed={isGroupCollapsed(block.group.id)}
                      over={groupOver}
                      dragging={groupDrag?.id === block.group.id}
                      dropIndex={groupOver ? dropTarget.index : null}
                      draft={draftIn(block.group.id)}
                      t={t}
                      renderTask={card}
                      onStartDrag={onGroupStartDrag}
                      onToggleGroup={onToggleGroup}
                      onRenameGroup={onRenameGroup}
                      onAdd={onAdd}
                      onRemoveGroup={onRemoveGroup}
                      onArchiveGroup={onArchiveGroup}
                      onCommitDraft={onCommitDraft}
                      onCancelDraft={onCancelDraft}
                    />
                  )
                : card(block.task)}
            </div>
          )
        })}
        {draftIn(undefined) ? <TaskDraftCard t={t} onCommit={onCommitDraft} onCancel={onCancelDraft} /> : null}
        <div
          className="dsh-task-block-dropend"
          data-active={insertIndex !== null && insertIndex === dropMarkIndex}
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
