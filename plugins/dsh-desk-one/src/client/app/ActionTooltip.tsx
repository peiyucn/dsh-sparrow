/**
 * One hover/focus tooltip for icon-only actions across the panel.
 *
 * Native `title` bubbles are slow and unreliable on macOS (they need pointer movement after the
 * hover delay), so every icon-only action uses the official bubble instead. The bubble portals to
 * body: task lanes, the notes wall and the sessions pane all scroll and clip, and a fixed bubble
 * kept inside those stacking contexts would be cut off.
 */

import type { ReactElement } from 'react'
import { Tooltip, type TooltipSide } from '@deepseek-ai/dsh-client-ui-primitives'

/** Short enough that dense icon rows still explain themselves before the pointer moves on. */
const TOOLTIP_DELAY_MS = 400

export function ActionTooltip({ label, side = 'bottom', children }: {
  readonly label: string
  readonly side?: TooltipSide
  readonly children: ReactElement
}): ReactElement {
  return (
    <Tooltip label={label} side={side} delayMs={TOOLTIP_DELAY_MS} portal>
      {children}
    </Tooltip>
  )
}
