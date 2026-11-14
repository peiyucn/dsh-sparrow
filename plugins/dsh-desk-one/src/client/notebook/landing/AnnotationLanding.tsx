/**
 * Annotation landing page: the panel's 「批注」tab.
 *
 * The panel no longer manages a "notebook library": the official Workspace files page is the
 * picker, and this page's job is to get the user there (or to create the first workspace) plus
 * the three aggregates that are worth keeping — pending drafts, submitted records, recent reviews.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { NotebookSummaryResponse, NotebookSummaryRow } from '../../../notebook-contract.js'
import type { DeskTranslator } from '../../app/types.js'
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

/** One aggregate section; hidden while it has no rows. */
function LandingSection(props: {
  readonly t: DeskTranslator
  readonly title: string
  readonly rows: readonly NotebookSummaryRow[]
  readonly onOpen: (row: NotebookSummaryRow) => void
}): ReactElement | null {
  const { t, title, rows, onOpen } = props
  if (rows.length === 0) return null
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  return (
    <section className="dsh-desk-annotation-section">
      <h3 className="dsh-desk-annotation-sectiontitle">
        {title}
        {total === 0 ? null : <span className="dsh-desk-annotation-total">{t('annotation.count', { count: total })}</span>}
      </h3>
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
                  {row.count === 0 ? '' : t('annotation.count', { count: row.count })}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
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

  /** Reopen one file's annotation view (existing review session reused when still openable). */
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

  return (
    <div className="dsh-desk-annotation">
      <section className="dsh-desk-annotation-hero">
        <h2 className="dsh-desk-annotation-title">{t('annotation.title')}</h2>
        <p className="dsh-desk-annotation-hint">{hasWorkspace ? t('annotation.hint') : t('annotation.workspaceHint')}</p>
        <Button
          variant="primary"
          size="md"
          className="dsh-desk-annotation-primary"
          disabled={busy}
          onClick={() => { void openFiles() }}
        >
          {hasWorkspace ? t('annotation.openFiles') : t('annotation.createWorkspace')}
        </Button>
      </section>

      {error === null ? null : <p className="dsh-desk-error">{error}</p>}
      {loading
        ? <p className="dsh-desk-annotation-loading">{t('annotation.loading')}</p>
        : summary === null ? null : (
            <>
              <LandingSection t={t} title={t('annotation.drafts')} rows={summary.drafts} onOpen={openRow} />
              <LandingSection t={t} title={t('annotation.records')} rows={summary.records} onOpen={openRow} />
              <LandingSection t={t} title={t('annotation.recent')} rows={summary.recent} onOpen={openRow} />
            </>
          )}
    </div>
  )
}
