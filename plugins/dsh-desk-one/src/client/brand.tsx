/**
 * Shared DeskOne glyph: a desk silhouette with an agent spark.
 *
 * Used by the sidebar entry and the header brand lockup. `currentColor` keeps the official
 * sidebar selected/hover states working without a second color path.
 */

import type { ReactElement } from 'react'

export function DeskGlyph({ size = 24 }: { readonly size?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.25" y="8" width="17.5" height="6.5" rx="1.8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.25 14.5v4M17.75 14.5v4M7.5 11.25h4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M18.9 2.6l.78 2.12 2.12.78-2.12.78-.78 2.12-.78-2.12-2.12-.78 2.12-.78z" fill="currentColor" />
    </svg>
  )
}
