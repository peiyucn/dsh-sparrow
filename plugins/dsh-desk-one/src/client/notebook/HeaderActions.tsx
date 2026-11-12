/**
 * Notebook tab header actions (panel top bar), following the other tabs' order: the primary
 * action first, then the utility actions. Unlinking is not hidden in a menu — it names the real
 * workspace so the action says exactly what gets detached.
 */

import type { ReactElement } from 'react'
import type { DeskTranslator } from '../app/types.js'
import { plusIcon } from '../app/icons.js'
import type { NotebookPageController } from './hooks/useNotebookPage.js'

/** The notebook tab's header action row. */
export function NotebookHeaderActions(props: {
  readonly t: DeskTranslator
  readonly page: NotebookPageController
}): ReactElement | null {
  const { t, page } = props

  // The unlinked state owns its own call to action inside the page; the header stays empty then.
  if (page.rootPath === undefined) return null

  const workspaceName = page.workspace?.title
  const unlinkLabel = workspaceName === undefined
    ? t('notebook.disconnect')
    : t('notebook.disconnectNamed', { name: workspaceName })

  return (
    <>
      <button type="button" className="dsh-desk-action dsh-desk-action-primary" onClick={page.toggleNew}>
        {plusIcon}
        <span className="dsh-desk-action-label">{t('notebook.newNote')}</span>
      </button>
      <button
        type="button"
        className="dsh-desk-action"
        disabled={page.busy || page.browserOpen === 'pending'}
        onClick={() => { void page.openBrowser() }}
      >
        {page.browserOpen === 'pending' ? t('notebook.browserOpening') : t('notebook.openBrowser')}
      </button>
      <button
        type="button"
        className="dsh-desk-action dsh-desk-notebook-unlink"
        title={unlinkLabel}
        disabled={page.busy}
        onClick={() => { void page.disconnect() }}
      >
        <span className="dsh-desk-notebook-unlink-label">{unlinkLabel}</span>
      </button>
    </>
  )
}
