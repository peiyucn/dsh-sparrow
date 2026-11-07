/**
 * Sort dropdown for the task board — one compact trigger, options in a menu.
 *
 * Semantics and visuals follow the official Menu primitive (hairline elevated card, menuitemradio
 * rows, check on the current option); placement reuses the body-portal anchored-panel hook so it
 * is never clipped by the board.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactElement } from 'react'
import type { DeskTranslator } from '../../app/types.js'
import type { TaskSortMode } from '../types.js'
import { useAnchoredPanel } from '../hooks/useAnchoredPanel.js'

interface SortMenuProps {
  readonly t: DeskTranslator
  readonly mode: TaskSortMode
  readonly onChange: (mode: TaskSortMode) => void
}

const OPTIONS: readonly { mode: TaskSortMode; labelKey: 'task.sort.manual' | 'task.sort.created' | 'task.sort.due' }[] = [
  { mode: 'manual', labelKey: 'task.sort.manual' },
  { mode: 'created', labelKey: 'task.sort.created' },
  { mode: 'due', labelKey: 'task.sort.due' },
]

export function SortMenu({ t, mode, onChange }: SortMenuProps): ReactElement {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const style = useAnchoredPanel({ open, anchorRef, panelRef, gap: 6, margin: 8, maxWidth: 190 })
  const current = OPTIONS.find(option => option.mode === mode) ?? OPTIONS[0]
  const currentLabel = t(current.labelKey)

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
    // Focus the selected option so keyboard users land on the current state.
    const index = OPTIONS.findIndex(option => option.mode === mode)
    itemRefs.current[Math.max(0, index)]?.focus()
  }, [open, mode])

  const focusItem = (index: number): void => {
    const count = OPTIONS.length
    itemRefs.current[(index + count) % count]?.focus()
  }

  const choose = (next: TaskSortMode): void => {
    setOpen(false)
    onChange(next)
    anchorRef.current?.focus()
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="dsh-desk-action dsh-desk-sort-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t('task.sort.label')}: ${currentLabel}`}
        title={`${t('task.sort.label')}: ${currentLabel}`}
        onClick={() => setOpen(value => !value)}
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h12M6.5 10h7M8.5 14h3" />
        </svg>
        <span className="dsh-desk-action-label">{t('task.sort.label')}: {currentLabel}</span>
        <svg className="dsh-desk-sort-chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <path d="M7 8l3 3 3-3" />
        </svg>
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              className="dsh-desk-sort-menu"
              role="menu"
              aria-label={t('task.sort.label')}
              style={style ?? undefined}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  const index = itemRefs.current.indexOf(document.activeElement as HTMLButtonElement | null)
                  focusItem(index + 1)
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  const index = itemRefs.current.indexOf(document.activeElement as HTMLButtonElement | null)
                  focusItem(index - 1)
                }
                if (event.key === 'Home') {
                  event.preventDefault()
                  focusItem(0)
                }
                if (event.key === 'End') {
                  event.preventDefault()
                  focusItem(OPTIONS.length - 1)
                }
              }}
            >
              {OPTIONS.map((option, index) => {
                const selected = option.mode === mode
                return (
                  <button
                    key={option.mode}
                    ref={(node) => { itemRefs.current[index] = node }}
                    type="button"
                    className="dsh-desk-sort-option"
                    role="menuitemradio"
                    aria-checked={selected}
                    data-active={selected}
                    onClick={() => choose(option.mode)}
                  >
                    <span className="dsh-desk-sort-check" aria-hidden="true">
                      {selected
                        ? (
                            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 10.5l3 3 7-7" />
                            </svg>
                          )
                        : null}
                    </span>
                    {t(option.labelKey)}
                  </button>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
