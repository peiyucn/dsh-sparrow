/**
 * Shared DeskOne glyph: a rounded square with a small spark.
 *
 * Used by the sidebar entry and the header brand lockup. `currentColor` keeps the official
 * sidebar selected/hover states working without a second color path.
 */

import type { ReactElement } from 'react'

export function DeskGlyph({ size = 24 }: { readonly size?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 7.2l1.35 3.45L16.8 12l-3.45 1.35L12 16.8l-1.35-3.45L7.2 12l3.45-1.35z" fill="currentColor" />
    </svg>
  )
}