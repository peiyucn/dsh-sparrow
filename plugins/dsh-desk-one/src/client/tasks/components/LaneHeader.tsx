import type { ReactElement } from 'react'
import type { TaskStatus } from '../../../contract.js'
import type { DeskTranslator } from '../../app/types.js'

interface LaneHeaderProps {
  readonly status: TaskStatus
  readonly title: string
  readonly countLabel: string
  readonly compact: boolean
  readonly collapsed: boolean
  readonly t: DeskTranslator
  readonly onAdd: (status: TaskStatus) => void
  readonly onToggleCollapse: () => void
  readonly onBeginGroup: () => void
}

/** Fixed lane header: title + count, plus add / group / collapse actions on the right. */
export function LaneHeader({
  status, title, countLabel, compact, collapsed, t, onAdd, onToggleCollapse, onBeginGroup,
}: LaneHeaderProps): ReactElement {
  return (
    <header className="dsh-task-lane-head">
      <span className="dsh-task-lane-title">{title}</span>
      <span className="dsh-task-count">{countLabel}</span>
      {compact ? null : (
        <>
          <button
            type="button"
            className="dsh-task-add"
            aria-label={t('task.group.add')}
            title={t('task.group.add')}
            onClick={onBeginGroup}
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
}
