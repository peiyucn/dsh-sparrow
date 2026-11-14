/**
 * Shared DeskOne glyph: a spark framed by Chinese quotation brackets —「✦」— i.e. the upper-left
 * and lower-right corner marks are the outer frame instead of a full square. Each bracket covers one
 * half of the frame, so the mark still reads as a framed spark at 14px without a solid box.
 *
 * Used by the sidebar entry and the header brand lockup. `currentColor` keeps the official sidebar
 * selected/hover states working without a second color path.
 */

import type { ReactElement } from 'react'

/** Inner spark (tips at 4.4 / 19.6, concave edges pulled toward the centre). */
const SPARK_PATH = 'M12 4.4C12.55 9.2 14.8 11.45 19.6 12C14.8 12.55 12.55 14.8 12 19.6C11.45 14.8 9.2 12.55 4.4 12C9.2 11.45 11.45 9.2 12 4.4Z'
/** Upper half of the frame: the 「 corner — short top edge, long left edge. */
const QUOTE_TOP_PATH = 'M2.6 16V2.6H9'
/** Lower half of the frame: the 」 corner — short bottom edge, long right edge. */
const QUOTE_BOTTOM_PATH = 'M21.4 8V21.4H15'

export function DeskGlyph({ size = 24, strokeWidth = 1.6 }: { readonly size?: number; readonly strokeWidth?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={QUOTE_TOP_PATH} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d={QUOTE_BOTTOM_PATH} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d={SPARK_PATH} fill="currentColor" />
    </svg>
  )
}
