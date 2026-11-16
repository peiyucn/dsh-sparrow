/**
 * Tooltip for session-row actions. Native `title` bubbles are slow and unreliable on macOS (they
 * need pointer movement after the hover delay), so every icon action uses the official bubble
 * instead. The bubble portals to body: the sessions pane scrolls and clips, and a fixed bubble kept
 * inside that clip/stacking context would be cut off in a narrow sidebar.
 */

import type { ReactElement } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'

/** Short enough that dense icon rows still explain themselves before the pointer moves on. */
const TOOLTIP_DELAY_MS = 400

export function SessionActionTooltip({ label, children }: {
  readonly label: string
  readonly children: ReactElement
}): ReactElement {
  return (
    <Tooltip label={label} side="bottom" delayMs={TOOLTIP_DELAY_MS} portal>
      {children}
    </Tooltip>
  )
}
