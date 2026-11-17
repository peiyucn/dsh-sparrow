

import { useEffect, useState, type ReactNode } from 'react'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { LOCALE_NAMESPACE } from '../../constants.js'
import { DeskGlyph } from '../brand.js'
import { hydrateReviewSessions, isReviewSession, subscribeReviewSessions } from './review/sessions.js'
import type { NotebookApi } from './api.js'

interface ReviewSessionIconProps extends InjectFace<{ readonly notebook: NotebookApi }>, PropsLocale<typeof LOCALE_NAMESPACE> {
  readonly sessionId: string
}

export function ReviewSessionIcon({ sessionId, notebook, t }: ReviewSessionIconProps): ReactNode {
  const [, setVersion] = useState(0)
  useEffect(() => subscribeReviewSessions(() => { setVersion(value => value + 1) }), [])
  useEffect(() => { hydrateReviewSessions(notebook) }, [notebook])
  if (!isReviewSession(sessionId)) return null
  return (
    <span className="dsh-desk-review-session-mark" title={t('sessions.reviewMark')} aria-hidden="true">
      <DeskGlyph size={14} />
    </span>
  )
}
