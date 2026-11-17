

import { useCallback, useEffect, useRef, useState } from 'react'
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'


export const COPY_FEEDBACK_MS = 1_200


export type CopyFeedbackState = 'idle' | 'copied' | 'failed'


export interface CopyFeedback {
  readonly state: CopyFeedbackState

  readonly copy: (text?: string) => Promise<boolean>
}


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
