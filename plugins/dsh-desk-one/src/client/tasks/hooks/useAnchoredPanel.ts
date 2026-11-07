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
}

export function useAnchoredPanel({
  open, anchorRef, panelRef, gap = 6, margin = 8, maxWidth = 280,
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
      const width = Math.min(maxWidth, viewportWidth - margin * 2)
      panel.style.width = `${width}px`
      const height = panel.offsetHeight || 280
      const left = Math.min(Math.max(margin, rect.left), Math.max(margin, viewportWidth - margin - width))
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
          width,
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
  }, [anchorRef, gap, margin, maxWidth, open, panelRef])

  return style
}
