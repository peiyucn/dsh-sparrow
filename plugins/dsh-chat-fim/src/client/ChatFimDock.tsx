/** FIM 续写：共享状态 + 开关（input.left）+ 数据面 dock（composer.dock）+ @ 列表样式候选菜单（input.overlay）。 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useAnchoredMaxHeight, IconSparkle16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { TokenSpan } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'

export interface ChatFimDockInjected {
  /** 查询当前会话主模型是否支持（deepseek 系列）；false 时整体隐藏。 */
  isSupported: (sessionId: SessionId) => Promise<boolean>
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
export type ChatFimMenuProps = PropsRuntime<'conversation.input.overlay'> & ChatFimDockInjected & { t: TranslateNS<'chat-fim'> }

const PAUSE_MS = 400
const ENABLED_STORAGE_KEY = 'dsh-chat-fim:enabled'
/** 菜单高度设计上限（同官方 MenuDropdown）。 */
const MENU_MAX_HEIGHT = 320

/** 读取本地开关状态：默认关闭，仅显式存过 '1' 才开启；非法值回退关闭。 */
export function readEnabled(storage: { getItem(key: string): string | null }, key = ENABLED_STORAGE_KEY): boolean {
  const value = storage.getItem(key)
  return value === '1'
}

// 模块级共享开关：开关（input.left）与建议条（composer.dock）是两个 React 树，
// 用同一 bundle 内的可变状态 + 订阅器同步，避免靠 localStorage 事件（同页不触发）。
// 启动时读取本地持久化值；默认关闭（见 readEnabled）。
let sharedEnabled = false
try {
  sharedEnabled = readEnabled(window.localStorage)
} catch {
  sharedEnabled = false
}
const enabledListeners = new Set<() => void>()

/** 订阅共享开关状态；返回当前值。 */
export function useFimEnabled(): boolean {
  const [value, setValue] = useState(sharedEnabled)
  useEffect(() => {
    const listener = (): void => { setValue(sharedEnabled) }
    enabledListeners.add(listener)
    return () => { enabledListeners.delete(listener) }
  }, [])
  return value
}

/** 设置共享开关并持久化；返回新值。 */
export function setFimEnabled(next: boolean): void {
  if (sharedEnabled === next) return
  sharedEnabled = next
  window.localStorage.setItem(ENABLED_STORAGE_KEY, next ? '1' : '0')
  for (const listener of enabledListeners) listener()
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

// 模块级共享错误状态：禁用/凭据/上游错误让用户可见，而不是静默无建议。
let sharedError: string | null = null
const errorListeners = new Set<() => void>()

/** 订阅共享错误状态；返回当前值。 */
export function useFimError(): string | null {
  const [value, setValue] = useState(sharedError)
  useEffect(() => {
    const listener = (): void => { setValue(sharedError) }
    errorListeners.add(listener)
    return () => { errorListeners.delete(listener) }
  }, [])
  return value
}

/** 设置共享错误状态。 */
export function setFimError(next: string | null): void {
  if (sharedError === next) return
  sharedError = next
  for (const listener of errorListeners) listener()
}

// 模块级共享「模型支持」状态：主模型非 deepseek 系列时整体隐藏（像没装插件）。
let sharedSupported = true
const supportedListeners = new Set<() => void>()

/** 订阅共享模型支持状态；返回当前值。 */
export function useFimSupported(): boolean {
  const [value, setValue] = useState(sharedSupported)
  useEffect(() => {
    const listener = (): void => { setValue(sharedSupported) }
    supportedListeners.add(listener)
    return () => { supportedListeners.delete(listener) }
  }, [])
  return value
}

/** 设置共享模型支持状态。 */
export function setFimSupported(next: boolean): void {
  if (sharedSupported === next) return
  sharedSupported = next
  for (const listener of supportedListeners) listener()
}

/** 一条「建议 + 生成它的草稿快照」：菜单视图据此渲染与采用（span CAS）。 */
export interface FimSuggestionRecord {
  readonly text: string
  readonly sessionId: SessionId
  readonly draft: string
  readonly draftRev: number
}

// 模块级共享建议：dock（数据面）写入，overlay 菜单（视图）读取；随草稿/相位变化清空。
let sharedSuggestion: FimSuggestionRecord | null = null
const suggestionListeners = new Set<() => void>()

/** 订阅共享建议；返回当前记录。 */
export function useFimSuggestion(): FimSuggestionRecord | null {
  const [value, setValue] = useState(sharedSuggestion)
  useEffect(() => {
    const listener = (): void => { setValue(sharedSuggestion) }
    suggestionListeners.add(listener)
    return () => { suggestionListeners.delete(listener) }
  }, [])
  return value
}

/** 设置共享建议（null = 清空）。 */
export function setFimSuggestion(next: FimSuggestionRecord | null): void {
  if (sharedSuggestion === next) return
  sharedSuggestion = next
  for (const listener of suggestionListeners) listener()
}

/** composer 卡片视口矩形（旋转光环定位；只读测量）。 */
function composerCardRect(): { x: number; y: number; width: number; height: number } | undefined {
  const card = document.querySelector<HTMLElement>('[data-composer-card]')
  if (card === null) return undefined
  const rect = card.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return undefined
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
}

/** 注入开关样式、联想中脉冲 keyframes 与候选菜单样式（一次性，按 data 属性去重）。 */
export function ensureFimBusyStyles(): void {
  if (document.querySelector('style[data-dsh-chat-fim-busy]') !== null) return
  const style = document.createElement('style')
  style.dataset.dshChatFimBusy = ''
  style.textContent = `
.dsh-chat-fim-switch {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  height: 28px;
  padding: 0 12px 0 8px;
  border: 1px solid var(--dsw-alias-border-l1, #d4d8e0);
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 13px;
  line-height: 20px;
  white-space: nowrap;
  cursor: pointer;
}
.dsh-chat-fim-switch:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-chat-fim-switch-icon {
  display: inline-flex;
  flex: 0 0 auto;
  color: var(--dsw-alias-label-caption);
}
.dsh-chat-fim-switch-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-chat-fim-switch-on {
  color: var(--dsw-alias-button-info-fill, #4d6bfe);
  border-color: var(--dsw-alias-button-info-fill, #4d6bfe);
}
.dsh-chat-fim-switch-on .dsh-chat-fim-switch-icon {
  color: var(--dsw-alias-button-info-fill, #4d6bfe);
}
/* 关闭态：灰字区分（开启态紫色），不再用删除线。 */
.dsh-chat-fim-switch-off .dsh-chat-fim-switch-label {
  color: var(--dsw-alias-label-tertiary, #9aa0a6);
}
/* 窄行折叠为纯图标：官方 PermissionSelect 同款匿名 @container 规则，
   容器是 InputBar .row（container-type: inline-size），阈值同官方 460px。 */
@container (max-width: 460px) {
  .dsh-chat-fim-switch .dsh-chat-fim-switch-label {
    display: none;
  }
  .dsh-chat-fim-switch {
    padding: 0 8px;
  }
}
@property --dsh-chat-fim-angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
.dsh-chat-fim-ring {
  position: fixed;
  z-index: 2000;
  pointer-events: none;
  padding: 2px;
  border-radius: 24px;
  background: conic-gradient(
    from var(--dsh-chat-fim-angle),
    transparent 0deg,
    transparent 300deg,
    color-mix(in srgb, var(--dsw-alias-button-info-fill, #4d6bfe) 85%, transparent) 340deg,
    color-mix(in srgb, var(--dsw-alias-button-info-fill, #4d6bfe) 30%, transparent) 355deg,
    transparent 360deg
  );
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  animation: dsh-chat-fim-ring-spin 1.6s linear infinite;
}
@keyframes dsh-chat-fim-ring-spin {
  to { --dsh-chat-fim-angle: 360deg; }
}
/* 候选菜单锚点：镜像官方 overlayAnchor（绝对定位、零高、钉在 composer 卡片上沿）。 */
.dsh-chat-fim-menu-anchor {
  position: absolute;
  inset: 0 0 auto;
  height: 0;
}
/* 菜单卡：官方 MenuDropdown 视觉 token（见 ui-input-trigger/MenuView.module.css）；
   紫色边框与开关 on 态同款，与官方 @ 列表做视觉区分。 */
.dsh-chat-fim-menu {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 100;
  max-height: 320px;
  overflow: hidden;
  padding: 4px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--dsw-alias-button-info-fill, #4d6bfe);
  border-radius: 12px;
  background: var(--dsw-specific-menu);
  box-shadow: var(--dsw-shadow-lv3);
}
.dsh-chat-fim-menu-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 40px;
  padding: 8px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
  text-align: left;
}
.dsh-chat-fim-menu-row:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
/* 建议长句 2 行截断（超出省略），全文经 title 提示。 */
.dsh-chat-fim-menu-text {
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-width: 0;
}
/* 行尾键位提示：官方 @ 列表 drillHint 同款（caption 色文字 + 键盘帽，右对齐）。 */
.dsh-chat-fim-menu-trailing {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  /* 与建议文字保持呼吸间距（文字 flex:1 顶满后 auto 边距为 0，靠这里拉开）。 */
  padding-left: 24px;
}
.dsh-chat-fim-menu-hint {
  color: var(--dsw-alias-label-caption);
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
}
/* 键盘帽与官方 @ 列表 drillHint 完全同款（token 逐项一致：底色/圆角/内边距/字色）。 */
.dsh-chat-fim-menu-kbd {
  padding: 0 5px;
  border-radius: 4px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-caption);
  font-family: inherit;
  font-size: 11px;
  line-height: 18px;
}
`
  document.head.appendChild(style)
}

/** 输入框工具行左侧的开关胶囊（挂在 conversation.input.left）。 */
export function ChatFimSwitch(props: ChatFimSwitchProps) {
  const { t } = props
  const enabled = useFimEnabled()
  const busy = useFimBusy()
  const error = useFimError()
  const supported = useFimSupported()
  if (!supported) return null
  return (
    <>
      <button
        type="button"
        className={enabled ? 'dsh-chat-fim-switch dsh-chat-fim-switch-on' : 'dsh-chat-fim-switch dsh-chat-fim-switch-off'}
        title={busy ? t('dock.busy') : error ?? (enabled ? t('switch.onHint') : t('switch.offHint'))}
        aria-pressed={enabled}
        aria-busy={busy}
        onClick={() => { setFimEnabled(!enabled) }}
      >
        <span className="dsh-chat-fim-switch-icon" aria-hidden><IconSparkle16 size={14} /></span>
        <span className="dsh-chat-fim-switch-label">{t('switch.label')}</span>
      </button>
      {error !== null ? (
        <span style={{ color: 'var(--dsw-alias-state-warning-primary, #d9822b)', fontSize: 12 }} title={error}>⚠</span>
      ) : null}
    </>
  )
}

/**
 * 数据面（挂在 conversation.composer.dock）：读 InputZone 草稿快照 → 停顿后请求
 * FIM → 把「建议 + 快照」写共享 store；可见 UI 由 overlay 菜单与开关渲染。
 * 继续输入 / 发送 / 相位变化都会清空旧建议；联想中时渲染 composer 卡片外圈旋转紫光。
 * @param props - 槽位运行时 props + 注入动作。
 */
export function ChatFimDock(props: ChatFimDockProps) {
  const { session, input, requestComplete, isSupported } = props
  const [composing, setComposing] = useState(false)
  const [ring, setRing] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const enabled = useFimEnabled()
  const busy = useFimBusy()
  const supported = useFimSupported()

  // 会话切换时查询主模型支持状态；不支持则整体隐藏（像没装插件）。
  useEffect(() => {
    setFimSupported(true)
    let alive = true
    void isSupported(session.sessionId).then((next) => {
      if (alive) setFimSupported(next)
    }).catch(() => {
      // 查询失败默认显示。
    })
    return () => { alive = false }
  }, [isSupported, session.sessionId])

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
      setFimSuggestion(null)
    }
  }, [])

  useEffect(() => {
    setFimSuggestion(null)
    setFimBusy(false)
    setFimError(null)
    flightRef.current?.abort()

    const draft = input.draft
    if (!supported || !enabled || draft.trim() === '' || composing || input.phase !== 'plain') return

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
          const text = next[0]?.trim()
          if (text !== undefined && text !== '') {
            setFimSuggestion({ text, sessionId: session.sessionId, draft, draftRev: rev })
          }
          setFimError(null)
        })
        .catch((reason: unknown) => {
          // 失败可见化：禁用/凭据/上游错误显示在开关旁，而不是静默无建议。
          if (!controller.signal.aborted) {
            setFimError(reason instanceof Error ? reason.message : String(reason))
          }
        })
        .finally(() => {
          if (flightRef.current === controller) flightRef.current = null
          if (!controller.signal.aborted) setFimBusy(false)
        })
    }, PAUSE_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [composing, enabled, supported, input.draft, input.draftRev, input.phase, requestComplete, session.sessionId])

  // 联想中：整个 composer 卡片外圈旋转紫光（跟随卡片矩形，周期自愈）。
  useLayoutEffect(() => {
    if (!busy) {
      setRing(null)
      return
    }
    const measure = (): void => { setRing(composerCardRect() ?? null) }
    measure()
    const timer = window.setInterval(measure, 300)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [busy])

  return (
    <>
      {busy && ring !== null
        ? createPortal(
          <div
            className="dsh-chat-fim-ring"
            style={{ left: ring.x - 2, top: ring.y - 2, width: ring.width + 4, height: ring.height + 4 }}
            aria-hidden
          />,
          document.body,
        )
        : null}
    </>
  )
}

/**
 * 候选菜单视图（挂在 conversation.input.overlay）：官方 @ 候选菜单同款悬浮卡，
 * 锚点由 shell 承载，零定位 JS。Tab / mousedown 点选采用，Esc 丢弃；
 * 官方触发菜单（@/斜杠，`[data-trigger-menu]`）打开期间完全隐藏并让出按键。
 * @param props - 槽位运行时 props + 注入动作。
 */
export function ChatFimMenu(props: ChatFimMenuProps) {
  const { adopt, t } = props
  const suggestion = useFimSuggestion()
  const enabled = useFimEnabled()
  const supported = useFimSupported()
  const [triggerOpen, setTriggerOpen] = useState(() => document.querySelector('[data-trigger-menu]') !== null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)

  // 与官方触发菜单互斥：观察 overlay 锚点子树，官方菜单增删时实时刷新。
  useEffect(() => {
    const anchor = rootRef.current?.parentElement ?? null
    if (anchor === null) return
    const check = (): void => { setTriggerOpen(document.querySelector('[data-trigger-menu]') !== null) }
    check()
    const observer = new MutationObserver(check)
    observer.observe(anchor, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-trigger-menu'] })
    return () => { observer.disconnect() }
  }, [])

  const visible = suggestion !== null && enabled && supported && !triggerOpen

  const adoptSuggestion = useCallback((): void => {
    if (suggestion === null) return
    // 双保险：官方触发菜单打开时绝不采用（Tab 归官方菜单下钻）。
    if (document.querySelector('[data-trigger-menu]') !== null) return
    const span: TokenSpan = {
      start: suggestion.draft.length,
      end: suggestion.draft.length,
      draftRev: suggestion.draftRev,
    }
    if (adopt(suggestion.sessionId, suggestion.text, span)) {
      setFimSuggestion(null)
      setFimBusy(false)
    }
  }, [adopt, suggestion])

  // Tab 采用 / Esc 丢弃（capture 抢先于输入机；官方触发菜单打开时不响应）。
  useEffect(() => {
    if (!visible) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault()
        adoptSuggestion()
      } else if (event.key === 'Escape') {
        setFimSuggestion(null)
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [visible, adoptSuggestion])

  const maxHeight = useAnchoredMaxHeight(cardRef, MENU_MAX_HEIGHT, visible ? suggestion : null)

  return (
    <div ref={rootRef} className="dsh-chat-fim-menu-anchor">
      {visible && suggestion !== null ? (
        <div
          ref={cardRef}
          className="dsh-chat-fim-menu"
          style={{ maxHeight }}
          role="listbox"
          aria-label={t('dock.aria')}
        >
          <button
            type="button"
            role="option"
            aria-selected="true"
            className="dsh-chat-fim-menu-row"
            title={suggestion.text}
            // mousedown，不是 click：焦点保持在输入框（官方菜单同款 combobox 模式）。
            onMouseDown={(event) => {
              event.preventDefault()
              adoptSuggestion()
            }}
          >
            <span className="dsh-chat-fim-menu-text">{suggestion.text}</span>
            <span className="dsh-chat-fim-menu-trailing" aria-hidden>
              <span className="dsh-chat-fim-menu-hint">{t('menu.adopt')}</span>
              <kbd className="dsh-chat-fim-menu-kbd">Tab</kbd>
              <span className="dsh-chat-fim-menu-hint">{t('menu.dismiss')}</span>
              <kbd className="dsh-chat-fim-menu-kbd">Esc</kbd>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  )
}
