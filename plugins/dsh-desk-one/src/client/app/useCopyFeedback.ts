/**
 * Clipboard write with in-place feedback.
 *
 * Wraps the official `writeClipboard` so every call site shares one implementation: the write is
 * best-effort, the result is surfaced as `idle` / `copied` / `failed`, and the reset timer is
 * released on unmount (a raw `setTimeout` per component leaked the callback after unmount).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'

/** Default lifetime of the `copied` / `failed` state, in milliseconds. */
export const COPY_FEEDBACK_MS = 1_200

/** In-place feedback state of one clipboard action. */
export type CopyFeedbackState = 'idle' | 'copied' | 'failed'

/** Feedback state plus the action that produces it. */
export interface CopyFeedback {
  readonly state: CopyFeedbackState
  /** Write `text` (falling back to the configured text) and show the result briefly. */
  readonly copy: (text?: string) => Promise<boolean>
}

/**
 * Keep clipboard feedback local to the mounted control.
 * @param options.text - text copied when `copy()` is called without an argument.
 * @param options.feedbackMs - how long `copied` / `failed` stays visible (defaults to `COPY_FEEDBACK_MS`).
 * @returns the current state and the copy action.
 */
export function useCopyFeedback(options: {
  readonly text?: string
  readonly feedbackMs?: number
} = {}): CopyFeedback {
  const { text, feedbackMs = COPY_FEEDBACK_MS } = options
  const [state, setState] = useState<CopyFeedbackState>('idle')
  const mounted = useRef(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [])
  const copy = useCallback(async (next?: string): Promise<boolean> => {
    const ok = await writeClipboard(next ?? text ?? '')
    if (!mounted.current) return ok
    if (timer.current !== null) clearTimeout(timer.current)
    setState(ok ? 'copied' : 'failed')
    timer.current = setTimeout(() => {
      timer.current = null
      if (mounted.current) setState('idle')
    }, feedbackMs)
    return ok
  }, [feedbackMs, text])
  return { state, copy }
}
