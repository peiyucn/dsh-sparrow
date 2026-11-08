/**
 * Fixed-position placement for a body-portaled panel anchored to an element.
 *
 * The session picker lives in the card, whose lane is a scroll container: an in-flow popover gets
 * clipped by that overflow and squeezed by the card width. Portaling it to `document.body` plus
 * this hook keeps it viewport-fixed, flips it above the anchor when there is no room below, and
 * clamps it inside the visible area while the lane scrolls or the window resizes.
 */

import { useLayoutEffect, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'

interface AnchoredPanelOptions {
  readonly open: boolean
  readonly anchorRef: RefObject<HTMLElement | null>
  readonly panelRef: RefObject<HTMLElement | null>
  readonly gap?: number
  readonly margin?: number
  readonly maxWidth?: number
  /** Measure the panel content instead of forcing maxWidth (menus with little content). */
  readonly fitContent?: boolean
  /** Which panel edge the anchor aligns to. */
  readonly align?: 'start' | 'end'
}

export function useAnchoredPanel({
  open, anchorRef, panelRef, gap = 6, margin = 8, maxWidth = 280, fitContent = false, align = 'start',
}: AnchoredPanelOptions): CSSProperties | null {
  const [style, setStyle] = useState<CSSProperties | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null)
      return
    }
    let frame = 0
    const update = (): void => {
      const anchor = anchorRef.current
      const panel = panelRef.current
      if (anchor === null || panel === null) return
      const rect = anchor.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const available = Math.max(1, viewportWidth - margin * 2)
      let width = Math.min(maxWidth, available)
      if (fitContent) {
        // Never write a width here: the panel uses its CSS content width, so opening it cannot
        // flash from an old/fallback width to the measured one. We only measure for placement.
        panel.style.width = ''
        const measured = panel.getBoundingClientRect().width || panel.offsetWidth || Math.min(160, maxWidth)
        width = Math.min(Math.max(1, measured), maxWidth, available)
      } else {
        panel.style.width = `${width}px`
      }
      const height = panel.offsetHeight || 280
      const preferredLeft = align === 'end' ? rect.right - width : rect.left
      const left = Math.min(Math.max(margin, preferredLeft), Math.max(margin, viewportWidth - margin - width))
      const below = rect.bottom + gap
      const above = rect.top - gap - height
      const fitsBelow = below + height <= viewportHeight - margin
      const top = fitsBelow ? below : above >= margin ? above : Math.max(margin, viewportHeight - margin - height)
      const maxHeight = Math.max(180, fitsBelow ? viewportHeight - margin - top : rect.top - gap - margin)
      setStyle(current => {
        const next: CSSProperties = {
          position: 'fixed',
          left,
          top,
          ...(fitContent ? {} : { width }),
          maxHeight,
          zIndex: 1000,
        }
        const same = current !== null
          && current.left === next.left
          && current.top === next.top
          && current.width === next.width
          && current.maxHeight === next.maxHeight
        return same ? current : next
      })
    }
    update()
    const panel = panelRef.current
    const observer = panel !== null && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      if (frame !== 0) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        update()
      })
    }) : null
    if (panel !== null && observer !== null) observer.observe(panel)
    window.addEventListener('resize', update)
    document.addEventListener('scroll', update, true)
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', update)
      document.removeEventListener('scroll', update, true)
    }
  }, [align, anchorRef, fitContent, gap, margin, maxWidth, open, panelRef])

  return style
}
