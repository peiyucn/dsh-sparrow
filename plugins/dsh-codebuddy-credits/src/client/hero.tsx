/**
 * hero 入口的几何与 portal 目标：blank 会话官方 header 隐藏，额度入口改挂
 * `conversation.input.dock`，按会话根 `[data-phase]` 相位决定是否显示、再 portal 到官方角按钮左侧。
 * 取不到角按钮时退回固定 top/right（良性降级，不抛错）。
 */

import { useCallback, useEffect, useRef, useState } from 'react'

/** hero 入口几何兜底（角按钮取不到时）。 */
export const HERO_BADGE_FALLBACK_TOP_PX = 14
export const HERO_BADGE_FALLBACK_RIGHT_PX = 28
const HERO_BADGE_GAP_PX = 8
/** 入口按钮高度（与 .ccb-indicator-button 的 28px 一致，用于与角按钮垂直居中）。 */
const INDICATOR_BUTTON_HEIGHT_PX = 28
export const HEADER_CORNER_SELECTOR = '[data-conversation-header-corner]'

/** hero 入口的 portal 容器：必须是**拥有 `@container` 上下文**的元素（官方把 container-type 挂在 `.titleRow` 上；
 *  挂会话根会让窄化查询恒不命中，退化成不窄化）；角按钮须限定在本会话根内 query，多会话根并存会取错树。 */
export function heroPortalTarget(rootEl: Element): Element {
  return rootEl.querySelector(HEADER_CORNER_SELECTOR)?.parentElement ?? rootEl
}

/** 解析隐藏锚 span 所在的官方会话根，并跟随 `data-phase` 属性判断 hero 相位是否可见。 */
export function useHeroRoot(): {
  anchorRef: (el: HTMLSpanElement | null) => void
  rootEl: Element | null
  visible: boolean
} {
  const anchorRef = useRef<HTMLSpanElement | null>(null)
  const [rootEl, setRootEl] = useState<Element | null>(null)
  const [phase, setPhase] = useState<string | null>(null)
  // 回调 ref：锚 span 挂载后解析会话根（portal 容器 + 观察目标）。
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

/** hero 入口落点：贴官方角按钮左侧留 HERO_BADGE_GAP_PX、与之垂直居中；滚动不改相对位置，
 *  故只在挂载、相位切换与尺寸变化时重算。 */
export function useHeroAnchor(
  rootEl: Element | null,
  visible: boolean,
  variant: 'header' | 'hero',
): { top: number; right: number } | null {
  // null = 未量到，先用兜底几何。
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
