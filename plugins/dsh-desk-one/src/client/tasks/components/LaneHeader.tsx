/** Lane header: column title, count and the lane-scoped add / group buttons. */

import type { ReactElement } from 'react'
import type { TaskStatus } from '../../../contract.js'
import { ActionTooltip } from '../../app/ActionTooltip.js'
import type { DeskTranslator } from '../../app/types.js'

interface LaneHeaderProps {
  readonly status: TaskStatus
  readonly title: string
  readonly countLabel: string
  readonly compact: boolean
  readonly t: DeskTranslator
  readonly onAdd: (status: TaskStatus) => void
  readonly onBeginGroup: () => void
}

/** Fixed lane header: title + count, plus add / group actions on the right. */
export function LaneHeader({
  status, title, countLabel, compact, t, onAdd, onBeginGroup,
}: LaneHeaderProps): ReactElement {
  return (
    <header className="dsh-task-lane-head">
      <span className="dsh-task-lane-title">{title}</span>
      <span className="dsh-task-count">{countLabel}</span>
      {compact ? null : (
        <>
          <ActionTooltip label={t('task.group.add')}>
            <button
              type="button"
              className="dsh-task-add"
              aria-label={t('task.group.add')}
              onClick={onBeginGroup}
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <path d="M2.8 6.2h5l1.4 1.6h8v7.4H2.8zM2.8 6.2V4.8h5" />
              </svg>
            </button>
          </ActionTooltip>
          <ActionTooltip label={t('task.add')}>
            <button
              type="button"
              className="dsh-task-add"
              aria-label={t('task.add')}
              onClick={() => onAdd(status)}
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <path d="M10 4.5v11M4.5 10h11" />
              </svg>
            </button>
          </ActionTooltip>
        </>
      )}
    </header>
  )
}
