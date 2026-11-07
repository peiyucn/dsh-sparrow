import { useState } from 'react'
import type { ReactElement } from 'react'
import type { DeskTask, DeskTaskGroup } from '../../../contract.js'
import type { DeskTranslator } from '../../app/types.js'
import { LANE_LABEL_KEY } from '../taskLabels.js'

interface TaskArchiveViewProps {
  readonly tasks: readonly DeskTask[]
  readonly groups: readonly DeskTaskGroup[]
  readonly t: DeskTranslator
  readonly countText: (count: number) => string
  readonly onRestoreGroup: (group: DeskTaskGroup) => void
  readonly onDeleteGroup: (group: DeskTaskGroup) => void
  readonly onRestoreTask: (task: DeskTask) => void
  readonly onDeleteTask: (id: string) => void
}

/** Two-step delete row for an archived group (deleting it also deletes its cards). */
function GroupArchiveRow({
  group, countLabel, t, onRestore, onDelete,
}: {
  readonly group: DeskTaskGroup
  readonly countLabel: string
  readonly t: DeskTranslator
  readonly onRestore: (group: DeskTaskGroup) => void
  readonly onDelete: (group: DeskTaskGroup) => void
}): ReactElement {
  const [confirm, setConfirm] = useState(false)
  return (
    <li className="dsh-task-archive-row">
      <span className="dsh-task-archive-group-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2.8 6.2h5l1.4 1.6h8v7.4H2.8zM2.8 6.2V4.8h5" />
        </svg>
      </span>
      <span className="dsh-task-archive-title">{group.name}</span>
      <span className="dsh-task-archive-count">{countLabel}</span>
      <span className="dsh-task-archive-lane">{t(LANE_LABEL_KEY[group.status])}</span>
      <button
        type="button"
        className="dsh-desk-iconbtn"
        aria-label={t('task.group.restore')}
        title={t('task.group.restore')}
        onClick={() => onRestore(group)}
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <path d="M4.5 6.5v4h4" />
          <path d="M5 10.3A5.2 5.2 0 1 1 6.6 13.2" />
        </svg>
      </button>
      <button
        type="button"
        className="dsh-desk-iconbtn dsh-desk-iconbtn-danger"
        data-confirm={confirm}
        aria-label={confirm ? t('task.deleteConfirm') : t('task.delete')}
        title={confirm ? t('task.deleteConfirm') : t('task.delete')}
        onClick={() => { if (confirm) onDelete(group); else setConfirm(true) }}
        onBlur={() => setConfirm(false)}
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <path d="M4 6.5h12M8 6.5V5h4v1.5M6 6.5l.7 8.5h6.6l.7-8.5M8.5 9v4M11.5 9v4" />
        </svg>
      </button>
    </li>
  )
}

/** Two-step delete row for the archive list (same pattern as the cards). */
function ArchiveRow({
  task, t, onRestore, onDelete,
}: {
  readonly task: DeskTask
  readonly t: DeskTranslator
  readonly onRestore: (task: DeskTask) => void
  readonly onDelete: (id: string) => void
}): ReactElement {
  const [confirm, setConfirm] = useState(false)
  return (
    <li className="dsh-task-archive-row">
      <span className="dsh-task-archive-dot" data-color={task.color} />
      <span className="dsh-task-archive-title">{task.title}</span>
      <span className="dsh-task-archive-lane">{t(LANE_LABEL_KEY[task.status])}</span>
      <button
        type="button"
        className="dsh-desk-iconbtn"
        aria-label={t('task.restore')}
        title={t('task.restore')}
        onClick={() => onRestore(task)}
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <path d="M4.5 6.5v4h4" />
          <path d="M5 10.3A5.2 5.2 0 1 1 6.6 13.2" />
        </svg>
      </button>
      <button
        type="button"
        className="dsh-desk-iconbtn dsh-desk-iconbtn-danger"
        data-confirm={confirm}
        aria-label={confirm ? t('task.deleteConfirm') : t('task.delete')}
        title={confirm ? t('task.deleteConfirm') : t('task.delete')}
        onClick={() => { if (confirm) onDelete(task.id); else setConfirm(true) }}
        onBlur={() => setConfirm(false)}
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <path d="M4 6.5h12M8 6.5V5h4v1.5M6 6.5l.7 8.5h6.6l.7-8.5M8.5 9v4M11.5 9v4" />
        </svg>
      </button>
    </li>
  )
}

/** Archive tab: one row per archived group first, then per archived card. */
export function TaskArchiveView({
  tasks, groups, t, countText, onRestoreGroup, onDeleteGroup, onRestoreTask, onDeleteTask,
}: TaskArchiveViewProps): ReactElement {
  return (
    <div className="dsh-task-archive">
      {groups.length === 0 && tasks.length === 0
        ? <p className="dsh-desk-wall-hint">{t('task.archiveEmpty')}</p>
        : (
            <ul className="dsh-task-archive-list">
              {groups.map(group => (
                <GroupArchiveRow
                  key={group.id}
                  group={group}
                  countLabel={countText(tasks.filter(task => task.groupId === group.id).length)}
                  t={t}
                  onRestore={onRestoreGroup}
                  onDelete={onDeleteGroup}
                />
              ))}
              {tasks.map(task => (
                <ArchiveRow
                  key={task.id}
                  task={task}
                  t={t}
                  onRestore={onRestoreTask}
                  onDelete={onDeleteTask}
                />
              ))}
            </ul>
          )}
    </div>
  )
}
