

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { RING_THICKNESS } from '../constants.js'
import { TRIGGER_SENSITIVITIES, detectEndOfDraft, shouldTriggerSuggest } from '../suggest.js'
import type { ChatFimDockProps } from './contracts.js'
import { fimSupportRetryDelayMs } from './fim-support-machine.js'
import { createLazyDirectoryStore } from './lazy-directory-store.js'
import { useRingRect } from './ring.js'
import {
  clearSuggestAdoption, clearSuggestBusy, dispatchSupportEvent, peekSuggestAdoption, setSuggestBusy,
  setSuggestError, setSuggestion, useSuggestBusy, useSuggestEnabled, useSuggestSupported,
  useSuggestSupportState, useTriggerSensitivity,
} from './store.js'
import { CHAT_FIM_CLASS } from './styles.js'


const cls = CHAT_FIM_CLASS


export function ChatFimDock(props: ChatFimDockProps) {
  const { session, input, requestComplete, checkSupport, directoryFor, useProjection } = props
  const [composing, setComposing] = useState(false)
  const enabled = useSuggestEnabled()
  const busy = useSuggestBusy(session.sessionId)
  const supported = useSuggestSupported()
  const supportState = useSuggestSupportState()
  const sensitivity = useTriggerSensitivity()
  const sensitivityParams = TRIGGER_SENSITIVITIES[sensitivity]

  const anchorRef = useRef<HTMLSpanElement | null>(null)

  const ring = useRingRect(anchorRef, busy)




  const directoryAdapter = useMemo(
    () => createLazyDirectoryStore(directoryFor, session.sessionId),
    [directoryFor, session.sessionId],
  )
  const directoryCurrent = useSyncExternalStore(directoryAdapter.subscribe, directoryAdapter.getSnapshot)
  const projection = useProjection === undefined
    ? undefined
    : useProjection('modelSelection') as { next?: { provider: string; model: string } | null } | undefined
  const currentModel = directoryCurrent ?? projection?.next ?? null
  const currentKey = currentModel === null ? '' : `${currentModel.provider}:${currentModel.model}`


  useEffect(() => {
    dispatchSupportEvent({
      type: 'context-changed',
      address: { sessionId: session.sessionId, modelKey: currentKey },
    })
  }, [session.sessionId, currentKey])



  useEffect(() => {
    if (supportState.phase !== 'checking') return
    const address = supportState.address
    void checkSupport(address.sessionId as SessionId).then(
      (next) => dispatchSupportEvent(
        next === null
          ? { type: 'unknown', address }
          : { type: 'checked', address, supported: next },
      ),
      () => { dispatchSupportEvent({ type: 'unknown', address }) },
    )
  }, [supportState.phase, supportState.address.sessionId, supportState.address.modelKey, checkSupport])





  useEffect(() => {
    if (supportState.phase !== 'retrying') return
    const address = supportState.address
    const timer = setTimeout(() => {
      dispatchSupportEvent({ type: 'retry-tick', address })
    }, fimSupportRetryDelayMs(supportState.attempts))
    return () => { clearTimeout(timer) }
  }, [supportState.phase, supportState.address.sessionId, supportState.address.modelKey, supportState.attempts])

  const composingRef = useRef(false)
  const draftRevRef = useRef(input.draftRev)
  const draftRef = useRef(input.draft)
  const flightRef = useRef<AbortController | null>(null)
  draftRevRef.current = input.draftRev
  draftRef.current = input.draft

  useEffect(() => {
    const start = (): void => {
      composingRef.current = true
      setComposing(true)
    }
    const end = (): void => {
      composingRef.current = false
      setComposing(false)
    }
    document.addEventListener('compositionstart', start)
    document.addEventListener('compositionend', end)
    return () => {
      document.removeEventListener('compositionstart', start)
      document.removeEventListener('compositionend', end)
      flightRef.current?.abort()
      clearSuggestBusy(session.sessionId)
      setSuggestion(null)
    }
  }, [])

  useEffect(() => {


    const sessionId = session.sessionId
    setSuggestion(null)
    clearSuggestBusy(sessionId)
    setSuggestError(null)
    flightRef.current?.abort()

    const draft = input.draft

    if (!supported || !enabled || composing || input.phase !== 'plain') return



    const adoption = peekSuggestAdoption()
    if (adoption !== null && adoption.sessionId === sessionId && draft === adoption.draft + adoption.text) {
      clearSuggestAdoption()
    }
    if (!shouldTriggerSuggest(draft, sensitivity).ok) return

    const rev = input.draftRev
    const timer = setTimeout(() => {
      if (composingRef.current || rev !== draftRevRef.current || draftRef.current !== draft) return
      const controller = new AbortController()
      flightRef.current = controller
      setSuggestBusy(sessionId)
      void requestComplete(session.sessionId, draft, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return
          if (rev !== draftRevRef.current || draftRef.current !== draft) return
          const text = result.suggestions[0]?.trim()
          if (text !== undefined && text !== '') {
            setSuggestion({
              text,
              sessionId,
              draft,
              draftRev: rev,
              detectEnd: detectEndOfDraft(draft, input.occurrences),
              model: result.model,
              totalTokens: result.usage.promptTokens + result.usage.completionTokens,
              temperature: result.temperature,
            })
          }
          setSuggestError(null)
        })
        .catch((reason: unknown) => {

          if (!controller.signal.aborted) {
            setSuggestError(reason instanceof Error ? reason.message : String(reason))
          }
        })
        .finally(() => {
          if (flightRef.current === controller) flightRef.current = null
          if (!controller.signal.aborted) clearSuggestBusy(sessionId)
        })
    }, sensitivityParams.pauseMs)

    return () => {
      clearTimeout(timer)


      flightRef.current?.abort()
      clearSuggestBusy(sessionId)
    }
  }, [composing, enabled, supported, sensitivity, sensitivityParams, input.draft, input.draftRev, input.phase, requestComplete, session.sessionId])

  return (
    <>
      {}
      <span ref={anchorRef} className={cls.anchor} aria-hidden />
      {busy && ring !== null
        ? createPortal(
          <div
            className={cls.ring}
            style={{
              left: ring.x - RING_THICKNESS,
              top: ring.y - RING_THICKNESS,
              width: ring.width + RING_THICKNESS * 2,
              height: ring.height + RING_THICKNESS * 2,
            }}
            aria-hidden
          />,
          document.body,
        )
        : null}
    </>
  )
}
