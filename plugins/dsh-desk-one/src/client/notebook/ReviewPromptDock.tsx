/**
 * Conversation-area hint shown in sessions started by the review flow.
 *
 * Registered into the official session-scoped `conversation.input.dock` list (above the composer),
 * so it reads as the AI opening the review: left-aligned avatar + speech bubble. Other sessions
 * never render it because the component checks the review-session registry.
 */

import { useEffect, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { LOCALE_NAMESPACE } from '../../constants.js'
import { isReviewSession, subscribeReviewSessions } from '../reviewSessions.js'
import { DeskGlyph } from '../brand.js'

/** Runtime props: session-scoped dock owner passes the session snapshot; locale comes from our namespace. */
interface ReviewPromptDockProps extends PropsLocale<typeof LOCALE_NAMESPACE> {
  readonly session: { readonly sessionId: string; readonly blank?: boolean }
}

export function ReviewPromptDock({ session, t }: ReviewPromptDockProps): ReactNode {
  const [, setVersion] = useState(0)
  useEffect(() => subscribeReviewSessions(() => { setVersion(value => value + 1) }), [])
  // The hint is for opening a review; once the conversation starts it would only repeat itself.
  if (!isReviewSession(session.sessionId) || session.blank === false) return null
  return (
    <div className="dsh-desk-review-prompt" role="status">
      <span className="dsh-desk-review-prompt-avatar" aria-hidden="true"><DeskGlyph size={15} /></span>
      <p className="dsh-desk-review-prompt-text">
        {t('review.promptLead')}
        <span className="dsh-desk-review-prompt-key">{t('review.annotate')}</span>
        {t('review.promptStart')}
        <br />
        {t('review.promptAfter')}
        <span className="dsh-desk-review-prompt-key">{t('review.submitAll')}</span>
        {t('review.promptHandle')}
      </p>
    </div>
  )
}
