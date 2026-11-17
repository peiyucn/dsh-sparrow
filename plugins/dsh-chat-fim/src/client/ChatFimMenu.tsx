

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


const cls = CHAT_FIM_CLASS


export function ChatFimMenu(props: ChatFimMenuProps) {
  const { adopt, sessionId, t } = props
  const suggestion = useSuggestion()
  const enabled = useSuggestEnabled()
  const supported = useSuggestSupported()
  const [triggerOpen, setTriggerOpen] = useState(() => document.querySelector('[data-trigger-menu]') !== null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)


  useEffect(() => {
    const anchor = rootRef.current?.parentElement ?? null
    if (anchor === null) return
    const check = (): void => { setTriggerOpen(document.querySelector('[data-trigger-menu]') !== null) }
    check()
    const observer = new MutationObserver(check)
    observer.observe(anchor, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-trigger-menu'] })
    return () => { observer.disconnect() }
  }, [])



  const visible = suggestion !== null && enabled && supported && !triggerOpen && suggestion.sessionId === sessionId

  const adoptSuggestion = useCallback((): void => {
    if (suggestion === null || suggestion.sessionId !== sessionId) return

    if (document.querySelector('[data-trigger-menu]') !== null) return



    const span: TokenSpan = {
      start: suggestion.detectEnd,
      end: suggestion.detectEnd,
      draftRev: suggestion.draftRev,
    }

    markSuggestAdoption({ sessionId: suggestion.sessionId, draft: suggestion.draft, text: suggestion.text })
    if (adopt(suggestion.sessionId, suggestion.text, span)) {
      setSuggestion(null)
      clearSuggestBusy(suggestion.sessionId)
    } else {
      clearSuggestAdoption()
    }
  }, [adopt, sessionId, suggestion])



  useEffect(() => {
    if (!visible) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {

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
