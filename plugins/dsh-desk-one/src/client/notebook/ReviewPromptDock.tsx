/**
 * Placeholder-style review guidance rendered INSIDE the resident composer card
 * (`conversation.input.overlay`): it stands in for the official placeholder while the review
 * Session is blank, and disappears as soon as the conversation starts or the user types.
 */

import { useEffect, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { LOCALE_NAMESPACE } from '../../constants.js'
import { isReviewSession, subscribeReviewSessions } from '../reviewSessions.js'

interface ReviewComposerHintProps extends PropsLocale<typeof LOCALE_NAMESPACE> {
  readonly sessionId?: string
  readonly useSession?: (selector: (snapshot: { readonly blank?: boolean }) => boolean) => boolean
}

export function ReviewComposerHint({ sessionId, useSession, t }: ReviewComposerHintProps): ReactNode {
  const [, setVersion] = useState(0)
  useEffect(() => subscribeReviewSessions(() => { setVersion(value => value + 1) }), [])
  const blank = useSession === undefined ? true : useSession(snapshot => snapshot.blank !== false)
  if (sessionId === undefined || !isReviewSession(sessionId) || !blank) return null
  return <div className="dsh-desk-review-composer-hint" role="status">{t('review.composerHint')}</div>
}
