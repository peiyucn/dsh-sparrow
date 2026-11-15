/**
 * Trailing "…" tab: official conversation header keeps an overflow launcher at the end of the
 * tab strip. Today it opens the full tab list; later tabs can be moved out of the visible strip
 * without growing it indefinitely.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactElement } from 'react'
import { DeskGlyph } from '../brand.js'
import type { DeskTranslator, Tab } from './types.js'
import type { DeskTabEntry } from './tabs.js'
import { useAnchoredPanel } from '../tasks/hooks/useAnchoredPanel.js'

interface DeskTabMenuProps {
  readonly t: DeskTranslator
  readonly tab: Tab
  readonly onSelectTab: (tab: Tab) => void
  readonly entries: readonly DeskTabEntry[]
  /** "许个愿": prefill the feature-issue request in the conversation (never sends). */
  readonly onWish: () => void
}

export function DeskTabMenu({ t, tab, onSelectTab, entries, onWish }: DeskTabMenuProps): ReactElement {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const style = useAnchoredPanel({ open, anchorRef, panelRef, gap: 4, margin: 8, maxWidth: 288, fitContent: true, align: 'start' })

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null
      if (target === null) return
      if (anchorRef.current?.contains(target) === true) return
      if (panelRef.current?.contains(target) === true) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        anchorRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const index = entries.findIndex(entry => entry.tab === tab)
    itemRefs.current[Math.max(0, index)]?.focus()
  }, [entries, open, tab])

  /** Every menu has at least the "许个愿" row, so one more than the overflow entries. */
  const rowCount = entries.length + 1

  const focusItem = (index: number): void => {
    itemRefs.current[(index + rowCount) % rowCount]?.focus()
  }

  const choose = (next: Tab): void => {
    setOpen(false)
    onSelectTab(next)
    anchorRef.current?.focus()
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="dsh-desk-tab-more"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('tabs.more')}
        title={t('tabs.more')}
        onClick={() => setOpen(value => !value)}
      >
        <svg className="dsh-desk-tab-more-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M4.5 10h.01M10 10h.01M15.5 10h.01" />
        </svg>
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              className="dsh-desk-tabmenu"
              role="menu"
              aria-label={t('tabs.more')}
              style={style ?? undefined}
              onKeyDown={(event) => {
                const index = itemRefs.current.indexOf(document.activeElement as HTMLButtonElement | null)
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  focusItem(index + 1)
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  focusItem(index - 1)
                } else if (event.key === 'Home') {
                  event.preventDefault()
                  focusItem(0)
                } else if (event.key === 'End') {
                  event.preventDefault()
                  focusItem(rowCount - 1)
                }
              }}
            >
              {entries.map((entry, index) => {
                const selected = entry.tab === tab
                return (
                  <button
                    key={entry.tab}
                    ref={(node) => { itemRefs.current[index] = node }}
                    type="button"
                    className="dsh-desk-tabmenu-option"
                    role="menuitemradio"
                    aria-checked={selected}
                    data-active={selected}
                    onClick={() => choose(entry.tab)}
                  >
                    <span className="dsh-desk-tabmenu-check" aria-hidden="true">
                      {selected
                        ? (
                            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 10.5l3 3 7-7" />
                            </svg>
                          )
                        : null}
                    </span>
                    {t(entry.labelKey)}
                  </button>
                )
              })}
              {/* "许个愿": the overflow menu's permanent last row — prefill a feature-issue
                  request for this project's GitHub repository. */}
              <button
                ref={(node) => { itemRefs.current[entries.length] = node }}
                type="button"
                className="dsh-desk-tabmenu-option"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  onWish()
                  anchorRef.current?.focus()
                }}
              >
                {/* Same 16px check column as the tab rows; the Desk One mark takes the accent colour. */}
                <span className="dsh-desk-tabmenu-check" aria-hidden="true">
                  <DeskGlyph size={14} />
                </span>
                {t('tabs.wish')}
              </button>
              <p className="dsh-desk-tabmenu-hint">{t('tabs.wishHint')}</p>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
