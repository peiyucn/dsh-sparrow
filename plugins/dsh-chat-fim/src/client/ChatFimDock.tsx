/** FIM 续写：共享开关状态 + 输入框内开关（input.left）+ 幽灵文本续写（composer.dock）。 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { TokenSpan } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'

export interface ChatFimDockInjected {
  /** 发起一次 host 路由请求；由调用方负责陈旧响应判定。 */
  requestComplete: (
    sessionId: SessionId,
    prompt: string,
    signal: AbortSignal,
  ) => Promise<readonly string[]>
  /** 通过 scoped bail 事件把建议追加进草稿；返回是否被输入机接受。 */
  adopt: (sessionId: SessionId, text: string, span: TokenSpan) => boolean
}

export type ChatFimDockProps = PropsRuntime<'conversation.composer.dock'> & ChatFimDockInjected & { t: TranslateNS<'chat-fim'> }
export type ChatFimSwitchProps = PropsRuntime<'conversation.input.left'> & ChatFimDockInjected & { t: TranslateNS<'chat-fim'> }

const PAUSE_MS = 400
const ENABLED_STORAGE_KEY = 'dsh-chat-fim:enabled'

/** 读取本地开关状态：默认开启，非法值回退默认。 */
export function readEnabled(storage: { getItem(key: string): string | null }, key = ENABLED_STORAGE_KEY): boolean {
  const value = storage.getItem(key)
  return value !== '0'
}

// 模块级共享开关：开关（input.left）与建议条（composer.dock）是两个 React 树，
// 用同一 bundle 内的可变状态 + 订阅器同步，避免靠 localStorage 事件（同页不触发）。
let sharedEnabled = true
const listeners = new Set<() => void>()

/** 订阅共享开关状态；返回当前值。 */
export function useFimEnabled(): boolean {
  const [value, setValue] = useState(sharedEnabled)
  useEffect(() => {
    const listener = (): void => { setValue(sharedEnabled) }
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])
  return value
}

/** 设置共享开关并持久化；返回新值。 */
export function setFimEnabled(next: boolean): void {
  if (sharedEnabled === next) return
  sharedEnabled = next
  window.localStorage.setItem(ENABLED_STORAGE_KEY, next ? '1' : '0')
  for (const listener of listeners) listener()
}

// 模块级共享「联想中」状态：指示渲染在工具行开关旁，避免在输入框下方增减内容导致布局跳动。
let sharedBusy = false
const busyListeners = new Set<() => void>()

/** 订阅共享联想中状态；返回当前值。 */
export function useFimBusy(): boolean {
  const [value, setValue] = useState(sharedBusy)
  useEffect(() => {
    const listener = (): void => { setValue(sharedBusy) }
    busyListeners.add(listener)
    return () => { busyListeners.delete(listener) }
  }, [])
  return value
}

/** 设置共享联想中状态。 */
export function setFimBusy(next: boolean): void {
  if (sharedBusy === next) return
  sharedBusy = next
  for (const listener of busyListeners) listener()
}

/**
 * 输入区只读几何测量（幽灵文本定位特例，见 AGENTS.md）：
 * 仅当光标位于内容可编辑区末尾时，返回文末光标所在视口坐标；
 * 不修改编辑器内容，写入仍走 slash/input-insert-text bail 事件。
 */
function endCaretPoint(): { x: number; y: number } | undefined {
  const editor = document.querySelector<HTMLElement>('[data-composer-input]')
  if (editor === null) return undefined
  const selection = window.getSelection()
  if (selection === null || selection.rangeCount === 0) return undefined
  const focusNode = selection.focusNode
  if (focusNode === null || !editor.contains(focusNode)) return undefined
  const endRange = document.createRange()
  endRange.selectNodeContents(editor)
  endRange.collapse(false)
  const caretRange = selection.getRangeAt(0).cloneRange()
  caretRange.collapse(false)
  if (caretRange.compareBoundaryPoints(Range.END_TO_END, endRange) !== 0) return undefined
  const rect = endRange.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return undefined
  return { x: rect.right, y: rect.top }
}

/** 幽灵文本样式：与编辑器文本同字体族/字号/行高，浅色 + 斜体。 */
const ghostStyle = {
  position: 'fixed' as const,
  zIndex: 1000,
  pointerEvents: 'none' as const,
  whiteSpace: 'pre-wrap' as const,
  maxWidth: '70vw',
  overflow: 'hidden',
  fontFamily: 'var(--dsw-font-family)',
  fontSize: 'var(--dsh-content-font-size, 14px)',
  lineHeight: 'calc(24px + var(--dsh-content-font-delta, 0px))',
  fontStyle: 'italic' as const,
  color: 'var(--dsw-alias-label-tertiary, #9aa0a6)',
  opacity: 0.75,
} satisfies React.CSSProperties

const styles = {
  hint: {
    color: 'var(--dsw-alias-label-secondary, #6b7280)',
    fontSize: 12,
    padding: '2px',
  } satisfies React.CSSProperties,
  switch: {
    border: '1px solid var(--dsw-alias-border-l1, #d4d8e0)',
    borderRadius: 999,
    background: 'transparent',
    color: 'var(--dsw-alias-label-secondary, #6b7280)',
    fontSize: 12,
    padding: '2px 8px',
    cursor: 'pointer',
    lineHeight: 1.5,
  } satisfies React.CSSProperties,
  switchOn: {
    color: 'var(--dsw-alias-brand-primary, #4d6bfe)',
    borderColor: 'var(--dsw-alias-brand-primary, #4d6bfe)',
  } satisfies React.CSSProperties,
} as const

/** 输入框工具行左侧的开关胶囊（挂在 conversation.input.left）；联想中时在旁显示省略号。 */
export function ChatFimSwitch(props: ChatFimSwitchProps) {
  const { t } = props
  const enabled = useFimEnabled()
  const busy = useFimBusy()
  const label = `${t('switch.label')} · ${enabled ? t('switch.on') : t('switch.off')}`
  return (
    <>
      <button
        type="button"
        style={enabled ? { ...styles.switch, ...styles.switchOn } : styles.switch}
        title={enabled ? t('switch.onHint') : t('switch.offHint')}
        aria-pressed={enabled}
        onClick={() => { setFimEnabled(!enabled) }}
      >
        {label}
      </button>
      {busy ? (
        <span style={styles.hint} title={t('dock.busy')} aria-label={t('dock.busy')}>…</span>
      ) : null}
    </>
  )
}

/**
 * FIM 幽灵文本续写（挂在 conversation.composer.dock，视觉渲染进输入框光标处）。
 * 只从 InputZone owner share 读快照；继续输入 / 发送 / 相位变化都会清空旧建议。
 * 关闭时不渲染、不请求；Tab 采用、Esc 丢弃。
 * @param props - 槽位运行时 props + 注入动作。
 */
export function ChatFimDock(props: ChatFimDockProps) {
  const { session, input, requestComplete, adopt } = props
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null)
  const enabled = useFimEnabled()

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
      setFimBusy(false)
    }
  }, [])

  useEffect(() => {
    setSuggestion(null)
    setFimBusy(false)
    flightRef.current?.abort()

    const draft = input.draft
    if (!enabled || draft.trim() === '' || composing || input.phase !== 'plain') return

    const rev = input.draftRev
    const timer = setTimeout(() => {
      if (composingRef.current || rev !== draftRevRef.current || draftRef.current !== draft) return
      const controller = new AbortController()
      flightRef.current = controller
      setFimBusy(true)
      void requestComplete(session.sessionId, draft, controller.signal)
        .then((next) => {
          if (controller.signal.aborted) return
          if (rev !== draftRevRef.current || draftRef.current !== draft) return
          setSuggestion(next[0] ?? null)
        })
        .catch(() => {
          // 静默降级：续写失败不打扰输入。
        })
        .finally(() => {
          if (flightRef.current === controller) flightRef.current = null
          if (!controller.signal.aborted) setFimBusy(false)
        })
    }, PAUSE_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [composing, enabled, input.draft, input.draftRev, input.phase, requestComplete, session.sessionId])

  const ghost = !composing && input.phase === 'plain' && enabled ? suggestion : null

  // 幽灵文本定位：草稿 / 建议变化后重测；滚动与窗口变化时跟随。
  useLayoutEffect(() => {
    if (ghost === null) {
      setPoint(null)
      return
    }
    const measure = (): void => {
      setPoint(endCaretPoint() ?? null)
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [ghost, input.draft])

  // Tab 采用 / Esc 丢弃（capture 抢先于输入机）。
  useEffect(() => {
    if (ghost === null) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault()
        const span: TokenSpan = {
          start: input.draft.length,
          end: input.draft.length,
          draftRev: input.draftRev,
        }
        if (adopt(session.sessionId, ghost, span)) {
          setSuggestion(null)
          setFimBusy(false)
        }
      } else if (event.key === 'Escape') {
        setSuggestion(null)
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [adopt, ghost, input.draft, input.draftRev, session.sessionId])

  return ghost !== null && point !== null
    ? createPortal(
      <span
        style={{ ...ghostStyle, left: point.x, top: point.y }}
        data-chat-fim-ghost=""
        aria-hidden
      >
        {ghost}
      </span>,
      document.body,
    )
    : null
}
