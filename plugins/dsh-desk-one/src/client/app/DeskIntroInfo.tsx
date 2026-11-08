/**
 * Header intro info button: official plugin-page pattern (`pageIntro` + 20px info button).
 * The tooltip is portaled so the header's clipping never affects it.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactElement } from 'react'
import type { DeskTranslator } from './types.js'
import { useAnchoredPanel } from '../tasks/hooks/useAnchoredPanel.js'

const TOOLTIP_ID = 'dsh-desk-intro-tooltip'

export function DeskIntroInfo({ t }: { readonly t: DeskTranslator }): ReactElement {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const style = useAnchoredPanel({ open, anchorRef, panelRef, gap: 6, margin: 8, maxWidth: 280, fitContent: true, align: 'start' })

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        anchorRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open])

  return (
    <>
      <span
        className="dsh-desk-info-wrap"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <button
          ref={anchorRef}
          type="button"
          className="dsh-desk-info-button"
          aria-label={t('page.introLabel')}
          aria-describedby={open ? TOOLTIP_ID : undefined}
          aria-expanded={open}
          onClick={() => setOpen(value => !value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <circle cx="10" cy="10" r="6.7" />
            <path d="M10 9v4.4M10 6.6h.01" />
          </svg>
        </button>
      </span>
      {open
        ? createPortal(
            <div ref={panelRef} id={TOOLTIP_ID} className="dsh-desk-intro-tooltip" role="tooltip" style={style ?? undefined}>
              {t('page.introDetail')}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
