/**
 * Shared session-tree row. Active catalog, archived tree, stray and trash rows all use this one
 * component so indentation, typography, metadata and action placement cannot drift apart.
 *
 * The expand caret is a sibling of the title button (not a child): a disabled/live row must still
 * be collapsible, otherwise trash parents look permanently expanded/collapsed by accident.
 */

import type { ReactElement, ReactNode } from 'react'

export interface SessionTreeRowProps {
  readonly variant: 'active' | 'archive'
  readonly title: string
  readonly depth: number
  readonly subagent?: boolean
  /** Optional lineage badge text (e.g. "subagent"). */
  readonly tag?: ReactNode
  readonly live?: boolean
  readonly disabled?: boolean
  readonly onOpen?: () => void
  readonly status?: ReactNode
  readonly badges?: ReactNode
  readonly meta?: ReactNode
  readonly actions?: ReactNode
  readonly hasChildren?: boolean
  readonly expanded?: boolean
  readonly onToggleExpand?: () => void
  readonly expandLabel: string
  readonly collapseLabel: string
  readonly liveHint?: string
}

export function SessionTreeRow(props: SessionTreeRowProps): ReactElement {
  const { title, depth, subagent, disabled, onOpen } = props
  const nested = depth > 0
  const caret = props.hasChildren === true ? (
    <span
      className="dsh-desk-tree-caret"
      role="button"
      tabIndex={0}
      aria-label={props.expanded === true ? props.collapseLabel : props.expandLabel}
      onClick={() => props.onToggleExpand?.()}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          props.onToggleExpand?.()
        }
      }}
    >{props.expanded === true ? '▾' : '▸'}</span>
  ) : null
  const blocked = props.variant === 'archive' ? (props.live === true || disabled === true) : disabled === true
  return (
    <div
      className="dsh-desk-tree-row"
      data-nested={nested ? 'true' : undefined}
      data-depth={depth}
      data-variant={props.variant}
      data-live={props.live === true ? 'true' : undefined}
    >
      {caret}
      <button
        type="button"
        className="dsh-desk-tree-row-toggle"
        aria-label={title}
        title={props.live === true ? props.liveHint : title}
        disabled={blocked}
        onClick={() => { if (!blocked) onOpen?.() }}
      >
        <span className="dsh-desk-tree-title">{title}</span>
        {subagent === true ? <span className="dsh-desk-session-tag">{props.tag ?? props.status}</span> : null}
        {props.badges}
        {props.meta === undefined ? null : <span className="dsh-desk-tree-meta">{props.meta}</span>}
        {props.status === undefined ? null : <span className="dsh-desk-tree-status">{props.status}</span>}
      </button>
      {props.actions === undefined ? null : <div className="dsh-desk-tree-actions">{props.actions}</div>}
    </div>
  )
}
