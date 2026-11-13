/**
 * Trailing mark for a review Session while its row is busy: the official leading cell is replaced
 * by a status dot for running / pending rows, so the leading mark alone would only appear after the
 * run finishes. This one rides the trailing icon slot and yields whenever the row is idle.
 */

import { useEffect, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { LOCALE_NAMESPACE } from '../../constants.js'
import { DeskTabGlyph } from '../tabIcons.js'
import { isReviewSession, subscribeReviewSessions } from '../reviewSessions.js'

interface ReviewSessionTrailingIconProps extends PropsLocale<typeof LOCALE_NAMESPACE> {
  readonly sessionId: string
  readonly useSessionStatus?: (selector: (statuses: ReadonlyMap<string, { readonly running?: boolean; readonly pendingInteraction?: unknown }>) => boolean) => boolean
}

export function ReviewSessionTrailingIcon({ sessionId, t, useSessionStatus }: ReviewSessionTrailingIconProps): ReactNode {
  const [, setVersion] = useState(0)
  useEffect(() => subscribeReviewSessions(() => { setVersion(value => value + 1) }), [])
  const busy = useSessionStatus === undefined
    ? false
    : useSessionStatus(statuses => {
        const status = statuses.get(sessionId)
        return status !== undefined && (status.running === true || status.pendingInteraction !== undefined)
      })
  if (!isReviewSession(sessionId) || !busy) return null
  return (
    <span className="dsh-desk-review-session-mark dsh-desk-review-session-mark-trailing" title={t('sessions.reviewMark')} aria-hidden="true">
      <DeskTabGlyph tab="notebook" size={13} />
    </span>
  )
}
