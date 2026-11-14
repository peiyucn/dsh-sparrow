/**
 * Notebook tab header actions.
 *
 * The workspace switcher intentionally lives in the page's workspace bar: changing the linked
 * workspace is one click there, not an unlink/relink round-trip in the header. The header keeps only
 * the explicit "open file browser" action.
 */

import type { ReactElement } from 'react'
import type { DeskTranslator } from '../app/types.js'
import type { NotebookPageController } from './hooks/useNotebookPage.js'

/** The notebook tab's header action row. */
export function NotebookHeaderActions(props: {
  readonly t: DeskTranslator
  readonly page: NotebookPageController
}): ReactElement | null {
  const { t, page } = props

  // The unlinked state owns its own call to action inside the page; the header stays empty then.
  if (page.rootPath === undefined) return null

  return (
    <button
      type="button"
      className="dsh-desk-action"
      disabled={page.busy || page.browserOpen === 'pending'}
      onClick={() => { void page.openBrowser() }}
    >
      {page.browserOpen === 'pending' ? t('notebook.browserOpening') : t('notebook.openBrowser')}
    </button>
  )
}
