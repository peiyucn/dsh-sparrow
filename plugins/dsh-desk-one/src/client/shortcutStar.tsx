/**
 * Star glyph for the "add this tab to the left rail" shortcut.
 *
 * Convention: tab pinning (Chrome / VS Code) uses a pin, but adding an entry to a sidebar's
 * favourites/shortcut area is a star (Slack adds conversations to the sidebar favourites section
 * with a star). DSH's icon set has no star, so this draws one on the same 24px / 1.5px grid as the
 * other local glyphs; filled = already in the left rail.
 */

import type { ReactNode } from 'react'

/** @param props.size - rendered square size. @param props.filled - filled when the tab is already pinned. */
export function ShortcutStar({ size = 14, filled = false }: { readonly size?: number; readonly filled?: boolean }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3.6l2.52 5.11 5.64.82-4.08 3.98.96 5.62L12 16.6l-5.04 2.53.96-5.62-4.08-3.98 5.64-.82z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}
