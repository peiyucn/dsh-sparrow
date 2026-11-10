/**
 * Notebook shelf: the local library as a reading list.
 *
 * Read-only by design — no editor, no write buttons. Every row comes from the
 * host-side derived index; opening a page hands the path to the caller (the
 * review tab), which lives in the right sidebar.
 */

import { useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { NoteIndexEntry, NotebookStateResponse } from '../../contract.js'
import type { DeskTranslator } from '../app/types.js'
import { messageOf } from '../app/utils.js'
import type { NotebookApi } from './api.js'
import type { WorkspaceAccess } from './workspaces.js'

/** Which actionable count the list is narrowed to (`all` shows the recent list). */
type ShelfFilter = 'all' | 'missing' | 'empty'

/** One list row: title, relative path, metadata badges and date. */
function ShelfRow(props: {
  readonly t: DeskTranslator
  readonly entry: NoteIndexEntry
  readonly onOpen?: (path: string) => void
}): ReactElement {
  const { t, entry, onOpen } = props
  const content = (
    <>
      <span className="dsh-desk-notebook-row-title">{entry.title}</span>
      <span className="dsh-desk-notebook-row-path">{entry.path}</span>
      {entry.hasFrontmatter ? null : <span className="dsh-desk-notebook-row-badge">{t('notebook.missingBadge')}</span>}
      <span className="dsh-desk-notebook-tags">
        {entry.tags.slice(0, 3).map(tag => <span key={tag} className="dsh-desk-notebook-tag">{tag}</span>)}
      </span>
      {entry.date === undefined ? null : <span className="dsh-desk-notebook-row-date">{entry.date}</span>}
    </>
  )
  if (onOpen === undefined) return <div className="dsh-desk-notebook-row">{content}</div>
  return (
    <button type="button" className="dsh-desk-notebook-row" onClick={() => onOpen(entry.path)}>
      {content}
    </button>
  )
}

/** Notes tab body: create/import the library, search it, and read the index. */
export function NotebookView(props: {
  readonly t: DeskTranslator
  readonly notebook: NotebookApi
  readonly workspaceAccess: WorkspaceAccess
  readonly onOpen?: (path: string) => void
}): ReactElement {
  const { t, notebook, workspaceAccess } = props
  const [state, setState] = useState<NotebookStateResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<readonly NoteIndexEntry[] | null>(null)
  const [filter, setFilter] = useState<ShelfFilter>('all')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setState(await notebook.state())
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setLoading(false)
    }
  }, [notebook])

  useEffect(() => { void load() }, [load])

  // Debounced query + filter: no criteria falls back to the recent list.
  useEffect(() => {
    const needle = query.trim()
    if (needle === '' && filter === 'all') { setResults(null); return }
    let cancelled = false
    const timer = setTimeout(() => {
      void notebook.search({
        ...needle === '' ? {} : { query: needle },
        ...filter === 'missing' ? { missingFrontmatter: true } : {},
        ...filter === 'empty' ? { emptyBody: true } : {},
      }).then(
        payload => { if (!cancelled) setResults(payload.entries) },
        cause => { if (!cancelled) setError(messageOf(cause)) },
      )
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query, filter, notebook])

  const rows = results ?? state?.recent ?? []

  /** DSH's own workspace creation: pick a folder, register it, then point the library at it. */
  const createLibrary = useCallback(async (): Promise<void> => {
    setCreating(true)
    setCreateError(null)
    try {
      const workspace = await workspaceAccess.createFromPicker()
      if (workspace === null) return
      setState(await notebook.setRoot(workspace.path))
      setFilter('all')
      setQuery('')
    } catch (cause) {
      setCreateError(messageOf(cause))
    } finally {
      setCreating(false)
    }
  }, [notebook, workspaceAccess])

  /** Forget the configured root: back to the first-run state (the index is derived, so nothing is lost). */
  const resetRoot = useCallback(async (): Promise<void> => {
    setCreateError(null)
    try {
      setState(await notebook.clearRoot())
      setFilter('all')
      setQuery('')
    } catch (cause) {
      setCreateError(messageOf(cause))
    }
  }, [notebook])

  if (loading) {
    return <div className="dsh-desk-notebookview"><p className="dsh-desk-notebook-hint">{t('state.loading')}</p></div>
  }

  const rootStatus = state?.root.status ?? 'unset'
  const unusable = rootStatus !== 'ok'
  const unset = rootStatus === 'unset'
  const actionError = createError ?? error

  /** One create/import action, reused by every empty state and the shelf toolbar. */
  const libraryAction = (
    <button
      type="button"
      className="dsh-desk-action dsh-desk-action-primary"
      disabled={creating}
      onClick={() => { void createLibrary() }}
    >
      {creating ? t('state.loading') : t('notebook.createLibrary')}
    </button>
  )

  return (
    <div className="dsh-desk-notebookview">
      {actionError === null ? null : <p className="dsh-desk-notebook-error">{t('state.loadFailed', { message: actionError })}</p>}
      {unusable
        ? (
            <div className="dsh-desk-notebook-empty">
              <h3>{unset ? t('notebook.unsetTitle') : t('notebook.rootMissing')}</h3>
              <p>{unset ? t('notebook.unsetBody') : t('notebook.outside')}</p>
              <div className="dsh-desk-notebook-actions">
                {libraryAction}
                {unset ? null : <button type="button" className="dsh-desk-btn" onClick={() => { void resetRoot() }}>{t('notebook.reset')}</button>}
              </div>
              <p className="dsh-desk-notebook-hint">{t('notebook.createHint')}</p>
            </div>
          )
        : state !== null && state.stats.total === 0
          ? (
              <div className="dsh-desk-notebook-empty">
                <h3>{t('notebook.emptyLibrary')}</h3>
                <p>{t('notebook.emptyLibraryBody')}</p>
                <div className="dsh-desk-notebook-actions">
                  {libraryAction}
                  <button type="button" className="dsh-desk-btn" onClick={() => { void resetRoot() }}>{t('notebook.reset')}</button>
                </div>
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
                  <button type="button" className="dsh-desk-btn" onClick={() => { void createLibrary() }} disabled={creating}>
                    {t('notebook.changeRoot')}
                  </button>
                  <button type="button" className="dsh-desk-btn" onClick={() => { void resetRoot() }}>{t('notebook.reset')}</button>
                </div>
                {state === null ? null : (
                  <div className="dsh-desk-notebook-stats">
                    <button
                      type="button"
                      className="dsh-desk-notebook-chip"
                      data-active={filter === 'all'}
                      onClick={() => setFilter('all')}
                    >
                      {t('notebook.total')} <b>{state.stats.total}</b>
                    </button>
                    <button
                      type="button"
                      className="dsh-desk-notebook-chip"
                      data-active={filter === 'missing'}
                      onClick={() => setFilter(filter === 'missing' ? 'all' : 'missing')}
                    >
                      {t('notebook.missing')} <b>{state.stats.missingFrontmatter}</b>
                    </button>
                    <button
                      type="button"
                      className="dsh-desk-notebook-chip"
                      data-active={filter === 'empty'}
                      onClick={() => setFilter(filter === 'empty' ? 'all' : 'empty')}
                    >
                      {t('notebook.empty')} <b>{state.stats.emptyBody}</b>
                    </button>
                  </div>
                )}
                <div className="dsh-desk-notebook-listhead">
                  <span>{results === null ? t('notebook.recent') : t('notebook.results')}</span>
                  {state?.truncated === true ? <span>{t('notebook.truncated')}</span> : null}
                </div>
                <div className="dsh-desk-notebook-rows">
                  {rows.length === 0
                    ? <p className="dsh-desk-notebook-hint">{t('notebook.noResults')}</p>
                    : rows.map(entry => (
                        <ShelfRow key={entry.path} t={t} entry={entry} {...props.onOpen === undefined ? {} : { onOpen: props.onOpen }} />
                      ))}
                </div>
              </>
            )}
    </div>
  )
}
