/**
 * Copy actions shared by every session row (active, archived, stray, trash): one button copies the
 * display name, one the opaque Session id. Feedback stays on the button itself (success check, or a
 * failure label when the host rejects the clipboard write), so rows need no toast.
 */

import type { ReactElement } from 'react'
import {
  IconCheckOutlineRegular, IconCopyOutlineRegular, IconLinkOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useCopyFeedback, type CopyFeedbackState } from '../app/useCopyFeedback.js'
import type { DeskTranslator } from '../app/types.js'

function CopyButton(props: {
  readonly state: CopyFeedbackState
  readonly label: string
  readonly t: DeskTranslator
  readonly icon: ReactElement
  readonly onCopy: () => void
}): ReactElement {
  const { state, t } = props
  const text = state === 'copied'
    ? t('sessions.copied')
    : state === 'failed'
      ? t('sessions.copyFailed')
      : props.label
  return (
    <button
      type="button"
      className="dsh-desk-row-action dsh-desk-row-copy"
      data-copy-state={state === 'idle' ? undefined : state}
      title={text}
      aria-label={text}
      onClick={props.onCopy}
    >
      {state === 'copied' ? <IconCheckOutlineRegular size={14} /> : props.icon}
    </button>
  )
}

/** Name + id copy buttons for one session row. */
export function SessionCopyActions({ title, sessionId, t }: {
  readonly title: string
  readonly sessionId: string
  readonly t: DeskTranslator
}): ReactElement {
  const name = useCopyFeedback({ text: title })
  const id = useCopyFeedback({ text: sessionId })
  return (
    <>
      <CopyButton
        state={name.state}
        label={t('sessions.copyName')}
        t={t}
        icon={<IconCopyOutlineRegular size={14} />}
        onCopy={name.copy}
      />
      <CopyButton
        state={id.state}
        label={t('sessions.copyId')}
        t={t}
        icon={<IconLinkOutlineRegular size={14} />}
        onCopy={id.copy}
      />
    </>
  )
}
