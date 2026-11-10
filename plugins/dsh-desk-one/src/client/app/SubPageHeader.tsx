/**
 * Shared header for in-panel sub-pages (notes trash, task archive, calendar sources).
 * The back button lives in the shared top-bar actions slot; this header only owns the title and
 * optional count so every sub-page lines up identically.
 */
import type { ReactElement, ReactNode } from 'react'

export function SubPageHeader(props: {
  readonly title: string
  readonly count?: ReactNode
}): ReactElement {
  return (
    <div className="dsh-desk-subpage-head">
      <h2 className="dsh-desk-subpage-title">{props.title}</h2>
      {props.count === undefined ? null : <span className="dsh-desk-subpage-count">{props.count}</span>}
    </div>
  )
}

/** Shared "load more" footer for paged sub-page lists. */
export function LoadMore(props: {
  readonly more: boolean
  readonly label: string
  readonly onClick: () => void
}): ReactElement | null {
  if (!props.more) return null
  return (
    <button type="button" className="dsh-desk-subpage-loadmore" onClick={props.onClick}>
      {props.label}
    </button>
  )
}
