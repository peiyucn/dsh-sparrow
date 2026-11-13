/** Sync-failure rows shown inside the connection card that owns the failing source/calendar. */

import type { ReactElement } from 'react'
import type { DeskTranslator } from '../../app/types.js'
import type { SourceHealth } from './status.js'

/**
 * Render a source's sync failures beside its own connection card.
 * @param props.t - panel translator.
 * @param props.health - source health summary.
 * @returns the error rows, or null when the source is healthy.
 */
export function SourceIssues({ t, health }: { readonly t: DeskTranslator; readonly health: SourceHealth }): ReactElement | null {
  if (health.sourceError === undefined && health.calendarIssues.length === 0) return null
  return (
    <div className="dsh-desk-schedule-source-issues">
      {health.sourceError === undefined ? null : (
        <p className="dsh-desk-schedule-error">{t('schedule.sourceError', { message: health.sourceError })}</p>
      )}
      {health.calendarIssues.length === 0 ? null : (
        <ul className="dsh-desk-schedule-source-error-list">
          {health.calendarIssues.map(issue => (
            <li key={`${issue.name}:${issue.message}`}>{t('schedule.calendarError', { name: issue.name, message: issue.message })}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
