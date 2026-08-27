/** FIM dock 建议条：触发、展示、作废、采用。 */

import { useEffect, useRef, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { TokenSpan } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

export interface FimDockInjected {
  /** 发起一次 host 路由请求；由调用方负责陈旧响应判定。 */
  requestComplete: (
    sessionId: SessionId,
    prompt: string,
    signal: AbortSignal,
  ) => Promise<readonly string[]>
  /** 通过 scoped bail 事件把建议追加进草稿；返回是否被输入机接受。 */
  adopt: (sessionId: SessionId, text: string, span: TokenSpan) => boolean
}

export type FimDockProps = PropsRuntime<'conversation.input.dock'> & FimDockInjected

const PAUSE_MS = 400
const MAX_SUGGESTIONS = 3

const styles = {
  dock: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
    alignItems: 'center',
    padding: '6px 2px',
    fontSize: 13,
    lineHeight: 1.4,
  } satisfies React.CSSProperties,
  suggestion: {
    maxWidth: 420,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    padding: '4px 8px',
    borderRadius: 6,
    border: '1px solid var(--dsw-alias-border-l1, #d4d8e0)',
    background: 'var(--dsw-alias-bg-layer-1, #ffffff)',
    color: 'var(--dsw-alias-label-primary, #1f2329)',
    cursor: 'pointer',
  } satisfies React.CSSProperties,
  active: {
    outline: '2px solid var(--dsw-alias-brand-primary, #4d6bfe)',
    outlineOffset: 1,
  } satisfies React.CSSProperties,
  hint: {
    color: 'var(--dsw-alias-label-secondary, #6b7280)',
    padding: '4px 2px',
  } satisfies React.CSSProperties,
} as const

/**
 * FIM 建议条。只从 InputZone owner share 读快照；继续输入 / 发送 / 相位变化都会清空旧建议。
 * @param props - 槽位运行时 props + 注入动作。
 */
export function FimDock(props: FimDockProps) {
  const { session, input, requestComplete, adopt } = props
  const [suggestions, setSuggestions] = useState<readonly string[]>([])
  const [selected, setSelected] = useState(0)
  const [busy, setBusy] = useState(false)
  const [composing, setComposing] = useState(false)

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
    }
  }, [])

  useEffect(() => {
    setSuggestions([])
    setSelected(0)
    setBusy(false)
    flightRef.current?.abort()

    const draft = input.draft
    if (draft.trim() === '' || composing || input.phase !== 'plain') return

    const rev = input.draftRev
    const timer = setTimeout(() => {
      if (composingRef.current || rev !== draftRevRef.current || draftRef.current !== draft) return
      const controller = new AbortController()
      flightRef.current = controller
      setBusy(true)
      void requestComplete(session.sessionId, draft, controller.signal)
        .then((next) => {
          if (controller.signal.aborted) return
          if (rev !== draftRevRef.current || draftRef.current !== draft) return
          setSuggestions(next.slice(0, MAX_SUGGESTIONS))
          setSelected(0)
        })
        .catch(() => {
          // 静默降级：FIM 失败不打扰输入。
        })
        .finally(() => {
          if (flightRef.current === controller) flightRef.current = null
          if (!controller.signal.aborted) setBusy(false)
        })
    }, PAUSE_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [composing, input.draft, input.draftRev, input.phase, requestComplete, session.sessionId])

  if (suggestions.length === 0) return null

  const applySuggestion = (text: string): void => {
    const span: TokenSpan = {
      start: input.draft.length,
      end: input.draft.length,
      draftRev: input.draftRev,
    }
    if (adopt(session.sessionId, text, span)) {
      setSuggestions([])
      setSelected(0)
      setBusy(false)
    }
  }

  return (
    <div
      style={styles.dock}
      data-fim-dock=""
      role="listbox"
      aria-label="FIM 建议"
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setSelected(value => (value + 1) % suggestions.length)
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          setSelected(value => (value - 1 + suggestions.length) % suggestions.length)
        } else if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault()
          const suggestion = suggestions[selected]
          if (suggestion !== undefined) applySuggestion(suggestion)
        }
      }}
    >
      {busy ? <span style={styles.hint}>正在联想…</span> : null}
      {suggestions.map((suggestion, index) => (
        <button
          key={suggestion}
          type="button"
          role="option"
          aria-selected={index === selected}
          title={suggestion}
          style={{ ...styles.suggestion, ...index === selected ? styles.active : {} }}
          onMouseEnter={() => { setSelected(index) }}
          onClick={() => { applySuggestion(suggestion) }}
        >
          {suggestion}
        </button>
      ))}
    </div>
  )
}
