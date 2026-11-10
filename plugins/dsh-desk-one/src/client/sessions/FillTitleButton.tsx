/** Fills the exact session title into the delete-confirmation input (and the clipboard). */
import { useState } from 'react'
import type { ReactElement } from 'react'

export function FillTitleButton(props: {
  readonly title: string
  readonly label: string
  readonly onFill: () => void
}): ReactElement {
  const [done, setDone] = useState(false)
  const fill = (): void => {
    props.onFill()
    try { void navigator.clipboard.writeText(props.title) } catch { /* clipboard is best-effort */ }
    setDone(true)
    window.setTimeout(() => setDone(false), 1600)
  }
  return (
    <button type="button" className="dsh-desk-row-action" title={props.label} aria-label={props.label} onClick={fill}>
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {done
          ? <path d="M5 13l4 4L19 7" />
          : <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>}
      </svg>
    </button>
  )
}
