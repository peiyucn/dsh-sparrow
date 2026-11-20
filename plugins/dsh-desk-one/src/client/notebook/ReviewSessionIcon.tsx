

import { useEffect, useState, type ReactNode } from 'react'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { LOCALE_NAMESPACE } from '../../constants.js'
import { DeskGlyph } from '../brand.js'
import { forgetReviewSession, hydrateReviewSessions, isReviewSession, subscribeReviewSessions } from './review/sessions.js'
import type { NotebookApi } from './api.js'

interface ReviewSessionIconProps extends InjectFace<{ readonly notebook: NotebookApi }>, PropsLocale<typeof LOCALE_NAMESPACE> {
  readonly sessionId: string
}

export function ReviewSessionIcon({ sessionId, notebook, t }: ReviewSessionIconProps): ReactNode {
  const [, setVersion] = useState(0)
  useEffect(() => subscribeReviewSessions(() => { setVersion(value => value + 1) }), [])
  useEffect(() => { hydrateReviewSessions(notebook) }, [notebook])
  if (!isReviewSession(sessionId)) return null
  const clear = (): void => {
    void notebook.unmarkReviewSession(sessionId).then(() => {
      forgetReviewSession(sessionId)
    }, () => {

    })
  }
  return (
    <button
      type="button"
      className="dsh-desk-review-session-mark dsh-desk-review-session-mark-clear"
      title={t('sessions.clearReviewMark')}
      aria-label={t('sessions.clearReviewMark')}
      onPointerDown={event => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        clear()
      }}
    >
      <DeskGlyph size={14} />
    </button>
  )
}
