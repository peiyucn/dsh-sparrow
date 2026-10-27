/**
 * 候选菜单视图（挂在 conversation.input.overlay）：官方 @ 候选菜单同款悬浮卡，
 * 锚点由 shell 承载，零定位 JS。Tab / mousedown 点选采用，Esc 丢弃；
 * 官方触发菜单（@/斜杠，`[data-trigger-menu]`）打开期间完全隐藏并让出按键。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { MenuSurface, useAnchoredMaxHeight } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TokenSpan } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { MENU_MAX_HEIGHT } from '../constants.js'
import { formatTokenCount } from '../suggest.js'
import type { ChatFimMenuProps } from './contracts.js'
import {
  clearSuggestAdoption, clearSuggestBusy, markSuggestAdoption, setSuggestion, useSuggestion,
  useSuggestEnabled, useSuggestSupported,
} from './store.js'
import { CHAT_FIM_CLASS } from './styles.js'

/** 类名表别名：JSX 与事件里的选择器都走它，不手写字符串。 */
const cls = CHAT_FIM_CLASS

/**
 * 候选菜单视图（挂在 conversation.input.overlay）：官方 @ 候选菜单同款悬浮卡，
 * 锚点由 shell 承载，零定位 JS。Tab / mousedown 点选采用，Esc 丢弃；
 * 官方触发菜单（@/斜杠，`[data-trigger-menu]`）打开期间完全隐藏并让出按键。
 * @param props - 槽位运行时 props + 注入动作。
 */
export function ChatFimMenu(props: ChatFimMenuProps) {
  const { adopt, sessionId, t } = props
  const suggestion = useSuggestion()
  const enabled = useSuggestEnabled()
  const supported = useSuggestSupported()
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

  // 建议归属校验：共享建议按会话写入，切会话后到 dock 清空之前有一帧窗口，
  // 渲染与采用都必须确认是本会话的建议，防止 Tab 把文本 bail 进旧会话草稿。
  const visible = suggestion !== null && enabled && supported && !triggerOpen && suggestion.sessionId === sessionId

  const adoptSuggestion = useCallback((): void => {
    if (suggestion === null || suggestion.sessionId !== sessionId) return
    // 双保险：官方触发菜单打开时绝不采用（Tab 归官方菜单下钻）。
    if (document.querySelector('[data-trigger-menu]') !== null) return
    // span 用 detect 坐标（TokenSpan 平面）：@ 元素每个只占 1 字符，draft.length
    // 是 clipboard 坐标，含 @ 时会被官方 span 映射越界拒绝（Tab 失灵）；detectEnd
    // 在建议生成时按草稿快照扣除了 chip 的展开长度。
    const span: TokenSpan = {
      start: suggestion.detectEnd,
      end: suggestion.detectEnd,
      draftRev: suggestion.draftRev,
    }
    // 先记采纳标记：dock 据此跳过「旧草稿 + 建议文本」这一次触发；bail 失败则回滚。
    markSuggestAdoption({ sessionId: suggestion.sessionId, draft: suggestion.draft, text: suggestion.text })
    if (adopt(suggestion.sessionId, suggestion.text, span)) {
      setSuggestion(null)
      clearSuggestBusy(suggestion.sessionId)
    } else {
      clearSuggestAdoption()
    }
  }, [adopt, sessionId, suggestion])

  // Tab 采用（仅焦点在 composer 卡内）/ Esc 丢弃（capture 抢先于输入机）；
  // 建议卡外 pointerdown 丢弃（官方触发菜单同款行为）。
  useEffect(() => {
    if (!visible) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
        // 焦点不在输入区（例如刚点过聊天消息）时不劫持 Tab 走焦。
        const active = document.activeElement
        if (active instanceof HTMLElement && active.closest('[data-composer-card]') === null) return
        event.preventDefault()
        adoptSuggestion()
      } else if (event.key === 'Escape') {
        setSuggestion(null)
      }
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (!(event.target instanceof Element)) return
      // 卡内任意位置（含底栏/空白）与开关/灵敏度弹层的 mousedown 都阻止默认焦点转移：
      // 否则点一下输入框就失焦到 body，后续 Tab 的焦点检查失败表现为「Tab 失灵」（2026-09-03）。
      if (event.target.closest(`.${cls.menu}`) !== null) {
        event.preventDefault()
        return
      }
      if (event.target.closest(`.${cls.switch}`) !== null) {
        event.preventDefault()
        return
      }
      if (event.target.closest(`.${cls.sensitivityPopover}`) !== null) {
        event.preventDefault()
        return
      }
      setSuggestion(null)
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [visible, adoptSuggestion])

  const maxHeight = useAnchoredMaxHeight(cardRef, MENU_MAX_HEIGHT, visible ? suggestion : null)

  return (
    <div ref={rootRef} className={cls.menuAnchor}>
      {visible && suggestion !== null ? (
        <MenuSurface
          ref={cardRef}
          className={cls.menu}
          style={{ maxHeight }}
          role="listbox"
          aria-label={t('dock.aria')}
        >
          <button
            type="button"
            role="option"
            aria-selected="true"
            className={cls.menuRow}
            title={suggestion.text}
            // mousedown，不是 click：焦点保持在输入框（官方菜单同款 combobox 模式）。
            onMouseDown={(event) => {
              event.preventDefault()
              adoptSuggestion()
            }}
          >
            <span className={cls.menuText}>{suggestion.text}</span>
            <span className={cls.menuTrailing} aria-hidden>
              <span className={cls.menuHint}>{t('menu.adopt')}</span>
              <kbd className={cls.menuKbd}>Tab</kbd>
              <span className={cls.menuHint}>{t('menu.dismiss')}</span>
              <kbd className={cls.menuKbd}>Esc</kbd>
            </span>
          </button>
          <div className={cls.menuFooter}>
            <span className={cls.menuBrand}>🐦 dsh-sparrow</span>
            <span className={cls.menuUsage}>
              {t('menu.tokens', {
                tokens: formatTokenCount(suggestion.totalTokens),
                model: suggestion.model,
                temperature: suggestion.temperature,
              })}
            </span>
          </div>
        </MenuSurface>
      ) : null}
    </div>
  )
}
