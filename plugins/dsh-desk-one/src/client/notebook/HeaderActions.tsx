/**
 * Notebook tab header actions: the linked-workspace selector.
 *
 * The "workspace files" entry lives in the page (right column) with the official label and icon;
 * this header keeps only the workspace switch so the current library is always visible.
 */

import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { DeskTranslator } from '../app/types.js'
import type { NotebookPageController } from './hooks/useNotebookPage.js'

/** The notebook tab's header action row. */
export function NotebookHeaderActions(props: {
  readonly t: DeskTranslator
  readonly page: NotebookPageController
}): ReactElement {
  const { t, page } = props
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event: PointerEvent): void => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  // The header clips its glass layer with `overflow: hidden`; while the menu is open it must paint
  // past the header, otherwise the dropdown is cut off at the header's bottom edge.
  useEffect(() => {
    const header = rootRef.current?.closest('.dsh-desk-header')
    if (!(header instanceof HTMLElement)) return undefined
    if (open) header.dataset.workspaceMenu = 'open'
    else delete header.dataset.workspaceMenu
    return () => { delete header.dataset.workspaceMenu }
  }, [open])

  const currentName = page.workspace?.title ?? page.rootPath?.split(/[\\/]/u).pop() ?? ''
  return (
    <div className="dsh-desk-notebook-workspaceselect" ref={rootRef}>
      <button
        type="button"
        className="dsh-desk-action dsh-desk-notebook-workspacebtn"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={page.busy}
        onClick={() => setOpen(value => !value)}
      >
        {page.rootPath === undefined
          ? <span className="dsh-desk-notebook-workspacename">{t('notebook.chooseWorkspace')}</span>
          : (
              <>
                <span className="dsh-desk-notebook-workspacelabel">{t('notebook.workspaceLabel')}</span>
                <span className="dsh-desk-notebook-workspacename">{currentName}</span>
              </>
            )}
        <span className="dsh-desk-notebook-workspacecaret" aria-hidden="true">▾</span>
      </button>
      {open
        ? (
            <div className="dsh-desk-notebook-workspacemenu" role="menu">
              {page.workspaces.length === 0
                ? <p className="dsh-desk-notebook-workspaceempty">{t('notebook.noWorkspace')}</p>
                : page.workspaces.map(item => (
                    <button
                      key={item.workspaceId}
                      type="button"
                      role="menuitem"
                      className="dsh-desk-notebook-workspaceitem"
                      data-current={item.workspaceId === page.workspace?.workspaceId}
                      onClick={() => {
                        setOpen(false)
                        void page.switchTo(item)
                      }}
                    >
                      <span className="dsh-desk-notebook-workspaceitem-title">{item.title}</span>
                      <span className="dsh-desk-notebook-workspaceitem-path">{item.path}</span>
                    </button>
                  ))}
              <div className="dsh-desk-notebook-workspacesep" aria-hidden="true" />
              <button
                type="button"
                role="menuitem"
                className="dsh-desk-notebook-workspaceaction"
                onClick={() => {
                  setOpen(false)
                  void page.pickNewWorkspace()
                }}
              >
                {t('notebook.createWorkspace')}
              </button>
            </div>
          )
        : null}
    </div>
  )
}
