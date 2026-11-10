/** Icon actions for session rows: element-level operations are icons, section-level ones stay text. */
import type { ReactElement } from 'react'

type SessionActionKind = 'archive' | 'unarchive' | 'trash' | 'restore' | 'delete'

const PATHS: Record<SessionActionKind, ReactElement> = {
  archive: <><path d="M3 4h18v4H3z" /><path d="M5 8v11h14V8" /><path d="M9 12h6" /></>,
  unarchive: <><path d="M3 4h18v4H3z" /><path d="M5 8v11h14V8" /><path d="M12 16v-5" /><path d="M9.5 13.5 12 11l2.5 2.5" /></>,
  trash: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /><path d="M10 11v5" /><path d="M14 11v5" /></>,
  restore: <><path d="M4 10a8 8 0 1 0 2-5" /><path d="M4 4v6h6" /></>,
  delete: <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>,
}

export function SessionRowAction(props: {
  readonly kind: SessionActionKind
  readonly label: string
  readonly armed?: boolean
  readonly danger?: boolean
  readonly disabled?: boolean
  readonly onClick: () => void
}): ReactElement {
  return (
    <button
      type="button"
      className="dsh-desk-row-action"
      data-danger={props.danger === true ? 'true' : undefined}
      data-armed={props.armed === true ? 'true' : undefined}
      disabled={props.disabled === true}
      title={props.label}
      aria-label={props.label}
      onClick={props.onClick}
    >
      {props.armed === true
        ? <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        : <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{PATHS[props.kind]}</svg>}
    </button>
  )
}
