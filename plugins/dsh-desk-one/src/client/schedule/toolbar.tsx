/** Schedule toolbar: range navigation, view switch and last-sync stamp. */

import { addDays, formatDateLabel, formatFullDateLabel, formatMonthLabel, formatTime, startOfLocalDay } from './utils.js'
import type { DeskTranslator } from '../app/types.js'
import type { ReactElement } from 'react'
import type { ScheduleViewName } from './utils.js'

/* --------------------------------- toolbar ---------------------------------- */

interface ToolbarProps {
  readonly t: DeskTranslator
  readonly view: ScheduleViewName
  readonly cursor: Date
  readonly lastSyncedAt?: string
  readonly error: string | null
  readonly onView: (view: ScheduleViewName) => void
  readonly onStep: (direction: -1 | 1) => void
  readonly onToday: () => void
}

export function ScheduleToolbar(props: ToolbarProps): ReactElement {
  const { t, view, cursor, error } = props
  const weekStart = addDays(startOfLocalDay(cursor), -((cursor.getDay() + 6) % 7))
  const weekEnd = addDays(weekStart, 6)
  const rangeLabel = view === 'month'
    ? formatMonthLabel(cursor, t)
    : view === 'week'
      ? `${formatDateLabel(weekStart, t)} – ${formatDateLabel(weekEnd, t)}`
      : formatFullDateLabel(cursor, t)
  return (
    <div className="dsh-desk-schedule-toolbar">
      <div className="dsh-desk-schedule-nav">
        <button type="button" className="dsh-desk-schedule-icon" aria-label={t('schedule.prev')} title={t('schedule.prev')} onClick={() => props.onStep(-1)}>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <span className="dsh-desk-schedule-range">{rangeLabel}</span>
        <button type="button" className="dsh-desk-schedule-icon" aria-label={t('schedule.next')} title={t('schedule.next')} onClick={() => props.onStep(1)}>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M9 18l6-6-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button type="button" className="dsh-desk-schedule-chip" onClick={props.onToday}>{t('schedule.today')}</button>
      </div>
      <div className="dsh-desk-schedule-viewtabs" role="tablist">
        {(['month', 'week', 'list'] as const).map(name => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={view === name}
            className="dsh-desk-schedule-viewtab"
            data-active={view === name}
            onClick={() => props.onView(name)}
          >{t(`schedule.view.${name}` as never)}</button>
        ))}
      </div>
      <div className="dsh-desk-schedule-actions">
        <span className="dsh-desk-schedule-synced">
          {props.lastSyncedAt === undefined
            ? t('schedule.neverSynced')
            : t('schedule.lastSync', {
                time: `${formatDateLabel(new Date(props.lastSyncedAt), t)} ${formatTime(props.lastSyncedAt)}`,
              })}
        </span>
      </div>
      {error === null ? null : <p className="dsh-desk-schedule-error">{error}</p>}
    </div>
  )
}

