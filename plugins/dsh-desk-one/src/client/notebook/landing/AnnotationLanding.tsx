/**
 * Annotation landing page: the panel's 「批注」tab.
 *
 * The page follows the same compact, card-based vocabulary as the Sessions tab: one start card
 * carrying the primary action, then section heads + bordered lists. The official Workspace files
 * page is still the picker; this page never grows a second one.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type { NotebookSummaryResponse, NotebookSummaryRow } from '../../../notebook-contract.js'
import type { DeskTranslator } from '../../app/types.js'
import { folderIcon } from '../../app/icons.js'
import { messageOf } from '../../app/utils.js'
import type { NotebookApi } from '../api.js'
import type { ReviewOpenInput, ReviewOpenResult } from '../review-bridge.js'
import type { WorkspaceAccess, WorkspacePathView } from '../workspaces.js'

/** Props assembled by the panel page from its injected actions. */
export interface AnnotationLandingProps {
  readonly t: DeskTranslator
  readonly notebook: NotebookApi
  readonly workspaceAccess: WorkspaceAccess
  readonly onOpenReview: (input: ReviewOpenInput) => Promise<ReviewOpenResult>
  readonly onOpenBrowser: (workspaceId: string) => Promise<ReviewOpenResult>
}

/** One aggregate section: a session-style head plus a bordered list; hidden while empty. */
function LandingSection(props: {
  readonly t: DeskTranslator
  readonly title: string
  readonly count: string
  readonly rows: readonly NotebookSummaryRow[]
  readonly onOpen: (row: NotebookSummaryRow) => void
}): ReactElement | null {
  const { t, title, count, rows, onOpen } = props
  if (rows.length === 0) return null
  return (
    <section className="dsh-desk-session-section">
      <header className="dsh-desk-session-section-head">
        <h2 className="dsh-desk-session-section-title">{title}</h2>
        <span className="dsh-desk-session-section-count">{count}</span>
      </header>
      <div className="dsh-desk-session-group">
        <ul className="dsh-desk-annotation-list">
          {rows.map((row) => {
            const openable = row.fileId !== undefined && row.path !== undefined && row.workspaceId !== undefined
            return (
              <li key={row.key}>
                <button
                  type="button"
                  className="dsh-desk-annotation-row"
                  disabled={!openable}
                  onClick={() => { if (openable) onOpen(row) }}
                >
                  <span className="dsh-desk-annotation-rowtitle">{row.title}</span>
                  <span className="dsh-desk-annotation-rowmeta">
                    {[row.workspaceTitle, row.path].filter(value => value !== undefined && value !== '').join(' · ')}
                  </span>
                  <span className="dsh-desk-annotation-rowcount">
                    {row.rounds !== undefined
                      ? t('annotation.roundsCount', { rounds: row.rounds, count: row.count })
                      : row.count === 0 ? '' : t('annotation.count', { count: row.count })}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

/**
 * Render the landing page.
 * @param props - translator, host facade, workspace access, and the two navigation actions.
 * @returns the page body.
 */
export function AnnotationLanding(props: AnnotationLandingProps): ReactElement {
  const { t, notebook, workspaceAccess, onOpenReview, onOpenBrowser } = props
  const [workspaces, setWorkspaces] = useState<readonly WorkspacePathView[]>(() => workspaceAccess.list())
  const [summary, setSummary] = useState<NotebookSummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void notebook.summary().then((next) => {
      if (!cancelled) setSummary(next)
    }, (cause: unknown) => {
      if (!cancelled) setError(t('annotation.loadFailed', { message: messageOf(cause) }))
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [notebook, t])

  /** Open the official workspace files page; create the first workspace when there is none. */
  const openFiles = useCallback(async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      let targets = workspaceAccess.list()
      if (targets.length === 0) {
        const created = await workspaceAccess.createFromPicker()
        if (created === null) return
        targets = [created]
        setWorkspaces(targets)
      }
      const result = await onOpenBrowser(targets[0].workspaceId)
      if (!result.ok) setError(result.message ?? t('annotation.openFailed'))
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [onOpenBrowser, t, workspaceAccess])

  /** Reopen one file's annotation view (existing annotation session reused when still openable). */
  const openRow = useCallback((row: NotebookSummaryRow): void => {
    if (row.fileId === undefined || row.path === undefined || row.workspaceId === undefined) return
    setError(null)
    void onOpenReview({ path: row.path, fileId: row.fileId, workspaceId: row.workspaceId }).then((result) => {
      if (!result.ok) setError(result.message ?? t('annotation.openFailed'))
    }, (cause: unknown) => {
      setError(messageOf(cause))
    })
  }, [onOpenReview, t])

  const hasWorkspace = workspaces.length > 0
  const drafts = summary?.drafts ?? []
  const draftCount = drafts.reduce((sum, row) => sum + row.count, 0)
  const recordRounds = summary?.records.reduce((sum, row) => sum + (row.rounds ?? 0), 0) ?? 0
  const recordCount = summary?.records.reduce((sum, row) => sum + row.count, 0) ?? 0

  return (
    <div className="dsh-desk-annotation">
      <section className="dsh-desk-annotation-start dsh-desk-session-group">
        <p className="dsh-desk-annotation-starthint">{hasWorkspace ? t('annotation.hint') : t('annotation.workspaceHint')}</p>
        <button
          type="button"
          className="dsh-desk-action dsh-desk-action-primary dsh-desk-annotation-startaction"
          disabled={busy}
          onClick={() => { void openFiles() }}
        >
          {folderIcon}
          <span className="dsh-desk-action-label">{hasWorkspace ? t('annotation.openFiles') : t('annotation.createWorkspace')}</span>
        </button>
      </section>

      {error === null ? null : <p className="dsh-desk-page-hint">{error}</p>}
      {loading ? <p className="dsh-desk-page-hint">{t('annotation.loading')}</p> : summary === null ? null : (
        <>
          <LandingSection
            t={t}
            title={t('annotation.drafts')}
            count={t('annotation.count', { count: draftCount })}
            rows={summary.drafts}
            onOpen={openRow}
          />
          <LandingSection
            t={t}
            title={t('annotation.records')}
            count={t('annotation.roundsCount', { rounds: recordRounds, count: recordCount })}
            rows={summary.records}
            onOpen={openRow}
          />
          <LandingSection
            t={t}
            title={t('annotation.recent')}
            count={t('annotation.fileCount', { count: summary.recent.length })}
            rows={summary.recent}
            onOpen={openRow}
          />
        </>
      )}
    </div>
  )
}
