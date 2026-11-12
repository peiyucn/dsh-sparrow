/**
 * Notebook page: the library list, its root setting, and the review entry.
 *
 * The panel only browses and hands a page to the review tab (or the conversation); it never
 * edits files. Choosing a library reuses DSH's own workspace flow, so the AI can always edit
 * inside it.
 */

import { useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { DeskTranslator } from '../app/types.js'
import { messageOf } from '../app/utils.js'
import type { NotebookEntry, NotebookStateResponse } from '../../notebook-contract.js'
import type { NotebookApi } from './api.js'
import type { WorkspaceAccess } from './workspaces.js'
import type { ReviewOpenResult } from './review-bridge.js'

type Filter = 'all' | 'missing' | 'empty'

/** One list row: title, relative path, badges, and the review entry. */
function NotebookRow(props: {
  readonly t: DeskTranslator
  readonly entry: NotebookEntry
  readonly onOpen: () => void
}): ReactElement {
  const { t, entry, onOpen } = props
  return (
    <div className="dsh-desk-notebook-row" role="listitem">
      <button type="button" className="dsh-desk-notebook-open" onClick={onOpen} title={t('notebook.review')}>
        <span className="dsh-desk-notebook-row-title">{entry.title}</span>
        <span className="dsh-desk-notebook-row-path">{entry.path}</span>
        {entry.date === undefined ? null : <span className="dsh-desk-notebook-row-date">{entry.date}</span>}
      </button>
      <span className="dsh-desk-notebook-tags">
        {entry.tags.slice(0, 3).map(tag => <span key={tag} className="dsh-desk-notebook-tag">{tag}</span>)}
      </span>
    </div>
  )
}

/** Notebook library view. */
export function NotebookView(props: {
  readonly t: DeskTranslator
  readonly notebook: NotebookApi
  readonly workspaceAccess: WorkspaceAccess
  readonly onOpenReview: (path: string) => Promise<ReviewOpenResult>
}): ReactElement {
  const { t, notebook, workspaceAccess, onOpenReview } = props
  const [state, setState] = useState<NotebookStateResponse | null>(null)
  const [entries, setEntries] = useState<readonly NotebookEntry[] | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setError(null)
    try {
      setState(await notebook.state())
    } catch (cause) {
      setError(messageOf(cause))
    }
  }, [notebook])

  useEffect(() => { void load() }, [load])

  // Search only when the user narrows the list; otherwise the newest pages from state are shown.
  useEffect(() => {
    const narrowed = query.trim() !== '' || filter !== 'all'
    if (!narrowed) { setEntries(null); return }
    let cancelled = false
    void notebook.search({
      ...query.trim() === '' ? {} : { query },
      missingFrontmatter: filter === 'missing',
      emptyBody: filter === 'empty',
      limit: 200,
    }).then(payload => {
      if (!cancelled) setEntries(payload.entries)
    }, cause => {
      if (!cancelled) setError(messageOf(cause))
    })
    return () => { cancelled = true }
  }, [filter, notebook, query])

  const chooseRoot = useCallback(async (rootPath: string): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setState(await notebook.setRoot(rootPath))
      setPicking(false)
      setNotice(null)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [notebook])

  const pickNewFolder = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      const created = await workspaceAccess.createFromPicker()
      if (created === null) return
      await chooseRoot(created.path)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [chooseRoot, workspaceAccess])

  const disconnect = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      setState(await notebook.clearRoot())
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [notebook])

  const openReview = useCallback(async (path: string): Promise<void> => {
    const result = await onOpenReview(path)
    if (!result.ok) setNotice(result.message ?? t('review.openFailed'))
  }, [onOpenReview, t])

  const root = state?.config?.rootPath
  const workspaces = workspaceAccess.list()
  const rows = entries ?? state?.recent ?? []

  return (
    <div className="dsh-desk-notebookview">
      {error === null ? null : <p className="dsh-desk-notebook-error">{t('state.loadFailed', { message: error })}</p>}
      {notice === null ? null : <p className="dsh-desk-notebook-hint">{notice}</p>}
      {root === undefined
        ? (
            <div className="dsh-desk-notebook-empty">
              <h3>{t('notebook.unsetTitle')}</h3>
              <p>{t('notebook.unsetBody')}</p>
              <div className="dsh-desk-notebook-actions">
                <button type="button" className="dsh-desk-action dsh-desk-action-primary" disabled={busy} onClick={() => setPicking(current => !current)}>
                  {t('notebook.pick')}
                </button>
              </div>
              {picking
                ? (
                    <div className="dsh-desk-notebook-picker">
                      {workspaces.length === 0
                        ? <p className="dsh-desk-notebook-hint">{t('notebook.noWorkspace')}</p>
                        : workspaces.map(workspace => (
                            <button
                              key={workspace.workspaceId}
                              type="button"
                              className="dsh-desk-notebook-pickeritem"
                              disabled={busy}
                              onClick={() => { void chooseRoot(workspace.path) }}
                            >
                              <span>{workspace.title}</span>
                              <span className="dsh-desk-notebook-row-path">{workspace.path}</span>
                            </button>
                          ))}
                      <button type="button" className="dsh-desk-btn" disabled={busy} onClick={() => { void pickNewFolder() }}>
                        {t('notebook.pickFolder')}
                      </button>
                    </div>
                  )
                : null}
            </div>
          )
        : (
            <>
              <div className="dsh-desk-notebook-toolbar">
                <input
                  className="dsh-desk-notebook-search"
                  value={query}
                  placeholder={t('notebook.searchPlaceholder')}
                  onChange={event => setQuery(event.target.value)}
                />
                <button type="button" className="dsh-desk-btn" disabled={busy} onClick={() => { void disconnect() }}>
                  {t('notebook.disconnect')}
                </button>
              </div>
              <div className="dsh-desk-notebook-stats">
                <button type="button" className="dsh-desk-notebook-stat" data-active={filter === 'all'} onClick={() => setFilter('all')}>
                  {t('notebook.statAll', { count: state?.stats.total ?? 0 })}
                </button>
                <button type="button" className="dsh-desk-notebook-stat" data-active={filter === 'missing'} onClick={() => setFilter('missing')}>
                  {t('notebook.statMissing', { count: state?.stats.missingFrontmatter ?? 0 })}
                </button>
                <button type="button" className="dsh-desk-notebook-stat" data-active={filter === 'empty'} onClick={() => setFilter('empty')}>
                  {t('notebook.statEmpty', { count: state?.stats.emptyBody ?? 0 })}
                </button>
                <span className="dsh-desk-notebook-root" title={root}>{root}</span>
              </div>
              {rows.length === 0
                ? <p className="dsh-desk-notebook-hint">{t('notebook.empty')}</p>
                : (
                    <div className="dsh-desk-notebook-rows" role="list">
                      {rows.map(entry => (
                        <NotebookRow
                          key={entry.path}
                          t={t}
                          entry={entry}
                          onOpen={() => { void openReview(entry.path) }}
                        />
                      ))}
                    </div>
                  )}
            </>
          )}
    </div>
  )
}
