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
import type { WorkspacePathView, WorkspacePaths } from './workspaces.js'

/** Which actionable count the list is narrowed to (`all` shows the recent list). */
type ShelfFilter = 'all' | 'missing' | 'empty'

/** Join a workspace root and an optional subfolder into the path the host validates. */
function composeRoot(workspacePath: string, subfolder: string): string {
  const base = workspacePath.replace(/\\/gu, '/').replace(/\/+$/u, '')
  const sub = subfolder.trim().replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '')
  return sub === '' ? base : `${base}/${sub}`
}

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

/** The workspace picker: choose a DSH workspace, then an optional subfolder. */
function RootPicker(props: {
  readonly t: DeskTranslator
  readonly workspaces: readonly WorkspacePathView[]
  readonly busy: boolean
  readonly error: string | null
  readonly onConfirm: (rootPath: string) => void
  readonly onCancel: () => void
  readonly onRetry: () => void
}): ReactElement {
  const { t, workspaces, busy, error } = props
  const [picked, setPicked] = useState<string | null>(workspaces[0]?.path ?? null)
  const [subfolder, setSubfolder] = useState('')
  return (
    <div className="dsh-desk-notebook-picker">
      <h4>{t('notebook.pickTitle')}</h4>
      {workspaces.length === 0
        ? <p className="dsh-desk-notebook-hint">{t('notebook.pickEmpty')}</p>
        : (
            <div className="dsh-desk-notebook-picker-list">
              {workspaces.map(workspace => (
                <button
                  key={workspace.path}
                  type="button"
                  className="dsh-desk-notebook-picker-row"
                  data-picked={picked === workspace.path}
                  onClick={() => setPicked(workspace.path)}
                >
                  <span className="dsh-desk-notebook-picker-name">{workspace.title}</span>
                  <span className="dsh-desk-notebook-picker-path">{workspace.path}</span>
                </button>
              ))}
            </div>
          )}
      {workspaces.length === 0 ? null : (
        <label className="dsh-desk-notebook-hint">
          {t('notebook.subfolder')}
          <input
            className="dsh-desk-notebook-subfolder"
            value={subfolder}
            placeholder={t('notebook.subfolderPlaceholder')}
            onChange={event => setSubfolder(event.target.value)}
          />
        </label>
      )}
      {error === null ? null : <p className="dsh-desk-notebook-error">{error}</p>}
      <div className="dsh-desk-notebook-picker-actions">
        <button type="button" className="dsh-desk-btn" onClick={props.onCancel}>{t('notebook.cancel')}</button>
        {workspaces.length === 0
          ? <button type="button" className="dsh-desk-action dsh-desk-action-primary" onClick={props.onRetry}>{t('action.retry')}</button>
          : (
              <button
                type="button"
                className="dsh-desk-action dsh-desk-action-primary"
                disabled={busy || picked === null}
                onClick={() => { if (picked !== null) props.onConfirm(composeRoot(picked, subfolder)) }}
              >
                {t('notebook.confirm')}
              </button>
            )}
      </div>
    </div>
  )
}

/** Notes tab body: search, actionable counts, and the page list. */
export function NotebookView(props: {
  readonly t: DeskTranslator
  readonly notebook: NotebookApi
  readonly workspacePaths: WorkspacePaths
  readonly onOpen?: (path: string) => void
}): ReactElement {
  const { t, notebook, workspacePaths } = props
  const [state, setState] = useState<NotebookStateResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<readonly NoteIndexEntry[] | null>(null)
  const [filter, setFilter] = useState<ShelfFilter>('all')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerBusy, setPickerBusy] = useState(false)
  const [pickerError, setPickerError] = useState<string | null>(null)

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

  const confirmRoot = useCallback(async (rootPath: string): Promise<void> => {
    setPickerBusy(true)
    setPickerError(null)
    try {
      const next = await notebook.setRoot(rootPath)
      setState(next)
      setPickerOpen(false)
      setFilter('all')
      setQuery('')
    } catch (cause) {
      setPickerError(messageOf(cause))
    } finally {
      setPickerBusy(false)
    }
  }, [notebook])

  const reopenPicker = useCallback((): void => {
    setPickerError(null)
    setPickerOpen(true)
  }, [])

  // Read the workspace list on every render while the picker is open, so a service that
  // attaches late is picked up without a stale memo.
  const pickerWorkspaces = pickerOpen ? workspacePaths.list() : []

  if (loading) {
    return <div className="dsh-desk-notebookview"><p className="dsh-desk-notebook-hint">{t('state.loading')}</p></div>
  }

  const rootStatus = state?.root.status ?? 'unset'
  const unusable = rootStatus !== 'ok'
  const unset = rootStatus === 'unset'

  return (
    <div className="dsh-desk-notebookview">
      {error === null ? null : <p className="dsh-desk-notebook-error">{t('state.loadFailed', { message: error })}</p>}
      {unusable
        ? (
            <div className="dsh-desk-notebook-empty">
              <h3>{unset ? t('notebook.unsetTitle') : t('notebook.rootMissing')}</h3>
              <p>{unset ? t('notebook.unsetBody') : t('notebook.outside')}</p>
              <div className="dsh-desk-notebook-actions">
                <button type="button" className="dsh-desk-action dsh-desk-action-primary" onClick={reopenPicker}>
                  {t('notebook.pickFolder')}
                </button>
              </div>
              {pickerOpen
                ? (
                    <RootPicker
                      t={t}
                      workspaces={pickerWorkspaces}
                      busy={pickerBusy}
                      error={pickerError}
                      onConfirm={rootPath => { void confirmRoot(rootPath) }}
                      onCancel={() => setPickerOpen(false)}
                      onRetry={() => { setPickerOpen(false); reopenPicker() }}
                    />
                  )
                : null}
            </div>
          )
        : state !== null && state.stats.total === 0
          ? (
              <div className="dsh-desk-notebook-empty">
                <h3>{t('notebook.emptyLibrary')}</h3>
                <p>{t('notebook.emptyLibraryBody')}</p>
                <div className="dsh-desk-notebook-actions">
                  <button type="button" className="dsh-desk-btn" onClick={reopenPicker}>{t('notebook.changeRoot')}</button>
                </div>
                {pickerOpen
                  ? (
                      <RootPicker
                        t={t}
                        workspaces={pickerWorkspaces}
                        busy={pickerBusy}
                        error={pickerError}
                        onConfirm={rootPath => { void confirmRoot(rootPath) }}
                        onCancel={() => setPickerOpen(false)}
                        onRetry={() => { setPickerOpen(false); reopenPicker() }}
                      />
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
                  <button type="button" className="dsh-desk-btn" onClick={reopenPicker}>{t('notebook.changeRoot')}</button>
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
                {pickerOpen
                  ? (
                      <RootPicker
                        t={t}
                        workspaces={pickerWorkspaces}
                        busy={pickerBusy}
                        error={pickerError}
                        onConfirm={rootPath => { void confirmRoot(rootPath) }}
                        onCancel={() => setPickerOpen(false)}
                        onRetry={() => { setPickerOpen(false); reopenPicker() }}
                      />
                    )
                  : null}
              </>
            )}
    </div>
  )
}
