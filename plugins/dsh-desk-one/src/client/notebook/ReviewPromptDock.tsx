

import { useEffect, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { LOCALE_NAMESPACE } from '../../constants.js'
import { isReviewSession, subscribeReviewSessions } from './review/sessions.js'
import { reviewTabVisible, subscribeReviewTabVisibility } from './review/tab-visibility.js'

interface ReviewComposerHintProps extends PropsLocale<typeof LOCALE_NAMESPACE> {
  readonly sessionId?: string
}

export function ReviewComposerHint({ sessionId, t }: ReviewComposerHintProps): ReactNode {
  const [, setVersion] = useState(0)
  useEffect(() => subscribeReviewSessions(() => { setVersion(value => value + 1) }), [])
  useEffect(() => subscribeReviewTabVisibility(() => { setVersion(value => value + 1) }), [])
  if (sessionId === undefined || !isReviewSession(sessionId)) return null



  if (!reviewTabVisible()) return null
  return <div className="dsh-desk-review-composer-hint" role="status">{t('review.composerHint')}</div>
}
