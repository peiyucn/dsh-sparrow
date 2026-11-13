/**
 * Copy actions shared by every session row (active, archived, stray, trash): one button copies the
 * display name, one the opaque Session id. Feedback stays on the button itself (success check, or a
 * failure label when the host rejects the clipboard write), so rows need no toast.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
  IconCheckOutlineRegular, IconCopyOutlineRegular, IconLinkOutlineRegular, writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeskTranslator } from '../app/types.js'

/** How long the in-place copy feedback stays before the button returns to its normal label. */
const COPY_FEEDBACK_MS = 1_200

type CopyState = 'idle' | 'copied' | 'failed'

/** Write one string and keep local feedback; the reset timer is released on unmount. */
function useCopyFeedback(text: string): { readonly state: CopyState; readonly copy: () => void } {
  const [state, setState] = useState<CopyState>('idle')
  const mounted = useRef(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [])
  const copy = useCallback(() => {
    void writeClipboard(text).then(ok => {
      if (!mounted.current) return
      if (timer.current !== null) clearTimeout(timer.current)
      setState(ok ? 'copied' : 'failed')
      timer.current = setTimeout(() => {
        timer.current = null
        if (mounted.current) setState('idle')
      }, COPY_FEEDBACK_MS)
    })
  }, [text])
  return { state, copy }
}

function CopyButton(props: {
  readonly state: CopyState
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
  const name = useCopyFeedback(title)
  const id = useCopyFeedback(sessionId)
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
