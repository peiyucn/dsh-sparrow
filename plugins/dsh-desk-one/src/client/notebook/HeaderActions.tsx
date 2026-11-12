/**
 * Notebook tab header actions (panel top bar): the library count, the explicit file-browser
 * entry, the primary new-note action, and a More menu carrying the unlink action. Placement and
 * ordering follow the other tabs: utility actions first, the primary one at the far right, rare /
 * destructive actions folded into More instead of sitting in the row.
 */

import { useState } from 'react'
import type { ReactElement } from 'react'
import { IconEllipsisOutlineRegular, Menu, MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeskTranslator } from '../app/types.js'
import { plusIcon } from '../app/icons.js'
import type { NotebookPageController } from './hooks/useNotebookPage.js'

/** The notebook tab's header action row. */
export function NotebookHeaderActions(props: {
  readonly t: DeskTranslator
  readonly page: NotebookPageController
}): ReactElement | null {
  const { t, page } = props
  const [menuOpen, setMenuOpen] = useState(false)

  // The unlinked state owns its own call to action inside the page; the header stays empty then.
  if (page.rootPath === undefined) return null

  return (
    <>
      <span className="dsh-desk-header-count">{t('notebook.headerCount', { count: page.total })}</span>
      <button
        type="button"
        className="dsh-desk-action"
        disabled={page.busy || page.browserOpen === 'pending'}
        onClick={() => { void page.openBrowser() }}
      >
        {page.browserOpen === 'pending' ? t('notebook.browserOpening') : t('notebook.openBrowser')}
      </button>
      <button type="button" className="dsh-desk-action dsh-desk-action-primary" onClick={page.toggleNew}>
        {plusIcon}
        <span className="dsh-desk-action-label">{t('notebook.newNote')}</span>
      </button>
      <Menu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        align="end"
        anchor={(
          <button
            type="button"
            className="dsh-desk-action"
            aria-label={t('notebook.moreActions')}
            title={t('notebook.moreActions')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(value => !value)}
          >
            <IconEllipsisOutlineRegular />
          </button>
        )}
      >
        <MenuItemButton
          danger
          onSelect={() => {
            setMenuOpen(false)
            void page.disconnect()
          }}
        >
          {t('notebook.disconnect')}
        </MenuItemButton>
      </Menu>
    </>
  )
}
