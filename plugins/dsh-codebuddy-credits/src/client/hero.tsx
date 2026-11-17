

import { useCallback, useEffect, useRef, useState } from 'react'


export const HERO_BADGE_FALLBACK_TOP_PX = 14
export const HERO_BADGE_FALLBACK_RIGHT_PX = 28
const HERO_BADGE_GAP_PX = 8

const INDICATOR_BUTTON_HEIGHT_PX = 28
export const HEADER_CORNER_SELECTOR = '[data-conversation-header-corner]'


export function heroPortalTarget(rootEl: Element): Element {
  return rootEl.querySelector(HEADER_CORNER_SELECTOR)?.parentElement ?? rootEl
}


export function useHeroRoot(): {
  anchorRef: (el: HTMLSpanElement | null) => void
  rootEl: Element | null
  visible: boolean
} {
  const anchorRef = useRef<HTMLSpanElement | null>(null)
  const [rootEl, setRootEl] = useState<Element | null>(null)
  const [phase, setPhase] = useState<string | null>(null)

  const setAnchor = useCallback((el: HTMLSpanElement | null): void => {
    anchorRef.current = el
    setRootEl(el?.closest('[data-phase]') ?? null)
  }, [])
  useEffect(() => {
    if (rootEl === null) return
    const read = (): void => { setPhase(rootEl.getAttribute('data-phase')) }
    read()
    const observer = new MutationObserver(read)
    observer.observe(rootEl, { attributes: true, attributeFilter: ['data-phase'] })
    return () => { observer.disconnect() }
  }, [rootEl])
  return { anchorRef: setAnchor, rootEl, visible: phase === 'hero' }
}


export function useHeroAnchor(
  rootEl: Element | null,
  visible: boolean,
  variant: 'header' | 'hero',
): { top: number; right: number } | null {

  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null)

  const measure = useCallback(() => {
    const frame = rootEl?.getBoundingClientRect()
    if (frame === undefined) return
    const corner = document.querySelector(HEADER_CORNER_SELECTOR)?.getBoundingClientRect()
    if (corner !== undefined && corner.width > 0 && corner.height > 0) {
      setAnchor({
        top: Math.max(0, corner.top - frame.top + (corner.height - INDICATOR_BUTTON_HEIGHT_PX) / 2),
        right: Math.max(0, frame.right - corner.left + HERO_BADGE_GAP_PX),
      })
      return
    }
    setAnchor({ top: HERO_BADGE_FALLBACK_TOP_PX, right: HERO_BADGE_FALLBACK_RIGHT_PX })
  }, [rootEl])

  useEffect(() => {
    if (variant !== 'hero' || rootEl === null || !visible) return
    measure()
    window.addEventListener('resize', measure)
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
    if (observer !== undefined) {
      observer.observe(rootEl)
      const corner = document.querySelector(HEADER_CORNER_SELECTOR)
      if (corner !== null) observer.observe(corner)
    }
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [variant, rootEl, visible, measure])

  return anchor
}
