/**
 * Placeholder-style review guidance rendered INSIDE the resident composer card
 * (`conversation.input.overlay`). Every review Session keeps it as the composer placeholder —
 * a blank new one and a conversation already under way alike — and it disappears only while the
 * user is typing, because the official placeholder unmounts then (see review-styles.ts).
 */

import { useEffect, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { LOCALE_NAMESPACE } from '../../constants.js'
import { isReviewSession, subscribeReviewSessions } from './review/sessions.js'

interface ReviewComposerHintProps extends PropsLocale<typeof LOCALE_NAMESPACE> {
  readonly sessionId?: string
}

export function ReviewComposerHint({ sessionId, t }: ReviewComposerHintProps): ReactNode {
  const [, setVersion] = useState(0)
  useEffect(() => subscribeReviewSessions(() => { setVersion(value => value + 1) }), [])
  if (sessionId === undefined || !isReviewSession(sessionId)) return null
  return <div className="dsh-desk-review-composer-hint" role="status">{t('review.composerHint')}</div>
}
