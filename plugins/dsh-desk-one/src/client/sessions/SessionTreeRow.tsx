/**
 * Shared session-tree row. The active catalog (client snapshot) and the archive tree (host
 * projection) render through this one component; only the variant differs (read-only catalog vs
 * row actions). Keeps lineage rows visually and semantically identical across the page.
 */

import type { ReactElement, ReactNode } from 'react'

export interface SessionTreeRowProps {
  readonly variant: 'active' | 'archive'
  readonly title: string
  readonly depth: number
  readonly subagent?: boolean
  /** Optional lineage badge text (e.g. 子代理). */
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
  const indent = depth === 0 ? undefined : { paddingLeft: `calc(12px + ${depth} * 16px)` }
  const caret = props.hasChildren === true ? (
    <span
      className={props.variant === 'archive' ? 'dsh-desk-archive-caret' : 'dsh-desk-session-caret'}
      role="button"
      tabIndex={0}
      aria-label={props.expanded === true ? props.collapseLabel : props.expandLabel}
      onClick={event => { event.stopPropagation(); props.onToggleExpand?.() }}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          event.stopPropagation()
          props.onToggleExpand?.()
        }
      }}
    >{props.expanded === true ? '▾' : '▸'}</span>
  ) : null
  const main = (
    <>
      {props.variant === 'archive' ? caret : null}
      <span className={props.variant === 'archive' ? 'dsh-desk-archive-title' : 'dsh-desk-session-row-title'}>{title}</span>
      {subagent === true ? <span className="dsh-desk-session-tag">{props.tag ?? props.status}</span> : null}
      {props.badges}
      {props.meta === undefined ? null : <span className="dsh-desk-archive-meta">{props.meta}</span>}
    </>
  )
  if (props.variant === 'archive') {
    return (
      <div className="dsh-desk-archive-row" data-live={props.live === true ? 'true' : undefined} style={indent}>
        <button
          type="button"
          className="dsh-desk-archive-row-toggle"
          aria-label={title}
          title={props.live === true ? props.liveHint : title}
          disabled={props.live === true || disabled === true}
          onClick={() => { if (props.live !== true && disabled !== true) onOpen?.() }}
        >
          {main}
        </button>
        {props.actions === undefined ? null : <div className="dsh-desk-archive-actions">{props.actions}</div>}
      </div>
    )
  }
  return (
    <div className="dsh-desk-session-row-wrap" style={indent}>
      <button
        type="button"
        className="dsh-desk-session-row"
        data-state={props.live === true ? 'archived' : undefined}
        data-subagent={subagent === true ? 'true' : undefined}
        disabled={disabled === true}
        aria-label={`${title} · ${typeof props.status === 'string' ? props.status : ''}`}
        title={disabled === true ? undefined : title}
        onClick={() => { if (disabled !== true) onOpen?.() }}
      >
        {caret}
        <span className="dsh-desk-session-row-main">
          <span className="dsh-desk-session-row-title">{title}</span>
          {subagent === true ? <span className="dsh-desk-session-tag">{props.tag ?? props.status}</span> : null}
          {props.badges}
        </span>
        {props.meta === undefined ? null : <span className="dsh-desk-archive-meta">{props.meta}</span>}
        <span className="dsh-desk-session-row-meta">{props.status}</span>
      </button>
    </div>
  )
}
