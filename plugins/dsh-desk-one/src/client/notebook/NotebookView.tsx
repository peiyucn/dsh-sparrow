/**
 * Notebook page body: the list toolbar (search + the four record views), the paginated, internally
 * scrolling list, the new-note form, and the unlinked offer. All state and actions live in
 * `useNotebookPage` (owned by the panel), because the header renders this page's primary actions.
 */

import { useState } from 'react'
import type { ReactElement } from 'react'
import {
  Button, IconChevronLeftOutlineMedium, IconChevronRightOutlineRegular, IconSearchOutlineRegular,
  Input, Modal, SegmentedTabs, Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeskTranslator } from '../app/types.js'
import type { ReviewHistoryEntry } from '../../notebook-contract.js'
import type { NotebookPageController, NotebookRow } from './hooks/useNotebookPage.js'

/** Empty-state copy for the active view. */
function emptyText(page: NotebookPageController): string {
  const t = page.t
  if (page.searching) return t('notebook.searchEmpty')
  switch (page.mode) {
    case 'drafts': return t('notebook.draftsEmpty')
    case 'history': return t('notebook.historyEmpty')
    case 'missing': return t('notebook.emptyMissing')
    default: return t('notebook.emptyRecent')
  }
}

/** Read-only detail of one submitted review record. */
function RecordDialog(props: {
  readonly page: NotebookPageController
  readonly record: ReviewHistoryEntry | null
  readonly onClose: () => void
}): ReactElement | null {
  const { page, record, onClose } = props
  const { t } = page
  if (record === null) return null
  const linked = record.status === 'linked' && record.resolvedPath !== undefined
  return (
    <Modal
      open
      onClose={onClose}
      title={t('notebook.recordTitle')}
      closeLabel={t('notebook.close')}
      className="dsh-desk-notebook-recorddialog"
      footer={(
        <div className="dsh-desk-notebook-recordactions">
          <Button
            variant="ghost"
            size="sm"
            className="dsh-desk-notebook-recorddelete"
            disabled={page.busy}
            onClick={() => { void page.deleteHistory(record.record.id).then(onClose) }}
          >
            {t('review.delete')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!linked}
            onClick={() => {
              if (record.resolvedPath === undefined) return
              onClose()
              void page.openPage(record.resolvedPath)
            }}
          >
            {t('notebook.openOriginal')}
          </Button>
        </div>
      )}
    >
      <div className="dsh-desk-notebook-record">
        <div className="dsh-desk-notebook-recordmeta">
          <span className="dsh-desk-notebook-recordtitle">{record.record.fileTitle}</span>
          <span className="dsh-desk-notebook-recordpath">{record.resolvedPath ?? record.record.pathSnapshot}</span>
          <span className="dsh-desk-notebook-recorddate">{new Date(record.record.createdAt).toLocaleString()}</span>
          {linked ? null : <Tag tone="warning">{t('notebook.recordDetached')}</Tag>}
        </div>
        {record.record.annotations.length === 0
          ? <p className="dsh-desk-notebook-empty">{t('notebook.recordEmpty')}</p>
          : (
              <div className="dsh-desk-notebook-recordannos">
                {record.record.annotations.map((annotation, index) => (
                  <div className="dsh-desk-notebook-recordanno" key={annotation.id}>
                    <div className="dsh-desk-notebook-recordannohead">
                      <span className="dsh-desk-notebook-recordanno-no">{index + 1}</span>
                      <span className="dsh-desk-notebook-recordanno-range">
                        {annotation.scope === 'document'
                          ? t('review.documentScope')
                          : t('review.lineHint', {
                              start: annotation.startLine ?? 0,
                              end: annotation.endLine ?? annotation.startLine ?? 0,
                            })}
                      </span>
                    </div>
                    {annotation.quote === '' ? null : <p className="dsh-desk-notebook-recordquote">{annotation.quote}</p>}
                    <p className="dsh-desk-notebook-recordtext">{annotation.text}</p>
                  </div>
                ))}
              </div>
            )}
      </div>
    </Modal>
  )
}

/** One compact row: title, path, facts, optional inline delete. */
function Row({ page, row, onOpen }: {
  readonly page: NotebookPageController
  readonly row: NotebookRow
  readonly onOpen?: (() => void) | undefined
}): ReactElement {
  const { t } = page
  const open = onOpen ?? row.onOpen
  const body = (
    <>
      <span className="dsh-desk-notebook-rowtitle">{row.title}</span>
      <span className="dsh-desk-notebook-rowpath">{row.path}</span>
      <span className="dsh-desk-notebook-rowmeta">
        {row.missing === true ? <Tag tone="warning">{t('notebook.missingBadge')}</Tag> : null}
        {row.draftCount === undefined || row.draftCount === 0
          ? null
          : <Tag tone="neutral">{t('notebook.draftBadge', { count: row.draftCount })}</Tag>}
        {row.recordCount === undefined || row.recordCount === 0
          ? null
          : <Tag tone="info">{t('notebook.recordBadge', { count: row.recordCount })}</Tag>}
        {row.annotationCount === undefined || row.annotationCount === 0
          ? null
          : <Tag tone="neutral">{t('notebook.annotationBadge', { count: row.annotationCount })}</Tag>}
        {row.date === undefined ? null : <span className="dsh-desk-notebook-rowdate">{row.date}</span>}
      </span>
    </>
  )
  return (
    <div className="dsh-desk-notebook-row">
      {open === undefined
        ? <div className="dsh-desk-notebook-rowbody">{body}</div>
        : (
            <button type="button" className="dsh-desk-notebook-rowbody" title={row.path} onClick={open}>
              {body}
            </button>
          )}
      {row.onDelete === undefined ? null : (
        <span className="dsh-desk-notebook-rowaction">
          <Button variant="ghost" size="sm" disabled={page.busy} onClick={row.onDelete}>{t('review.delete')}</Button>
        </span>
      )}
    </div>
  )
}

/** The new-note form: one paragraph of intent, then create empty or let the AI draft it. */
function NewNoteForm({ page }: { readonly page: NotebookPageController }): ReactElement {
  const { t } = page
  const empty = page.brief.trim() === ''
  return (
    <section className="dsh-desk-notebook-new">
      <textarea
        className="dsh-desk-notebook-brief"
        value={page.brief}
        rows={3}
        placeholder={t('notebook.briefPlaceholder')}
        autoFocus
        onChange={event => page.setBrief(event.target.value)}
      />
      <div className="dsh-desk-notebook-newfoot">
        <p className="dsh-desk-notebook-fineprint">{t('notebook.briefHint')}</p>
        <div className="dsh-desk-notebook-newactions">
          <Button variant="outline" size="md" disabled={page.busy || empty} onClick={() => { void page.createEmpty() }}>
            {t('notebook.createEmpty')}
          </Button>
          <Button variant="primary" size="md" disabled={page.busy || empty} onClick={page.draftWithAi}>
            {t('notebook.aiDraft')}
          </Button>
        </div>
      </div>
      {page.state?.note2md === true ? <p className="dsh-desk-notebook-fineprint">{t('notebook.note2mdHint')}</p> : null}
    </section>
  )
}

/** Unlinked state: the two actions are the guidance, all copy sits below the divider. */
function Unlinked({ page }: { readonly page: NotebookPageController }): ReactElement {
  const { t } = page
  return (
    <div className="dsh-desk-notebook-center">
      <div className="dsh-desk-notebook-centerinner">
        <div className="dsh-desk-notebook-centeractions">
          <Button variant="primary" size="md" disabled={page.busy} onClick={page.toggleChoosing}>
            {t('notebook.linkWorkspace')}
          </Button>
          <Button variant="outline" size="md" disabled={page.busy} onClick={() => { void page.pickNewWorkspace() }}>
            {t('notebook.createWorkspace')}
          </Button>
        </div>
        {page.choosing
          ? (
              <div className="dsh-desk-notebook-picker">
                {page.workspaces.length === 0
                  ? <p className="dsh-desk-notebook-centerhint">{t('notebook.noWorkspace')}</p>
                  : page.workspaces.map(item => (
                      <button key={item.workspaceId} type="button" className="dsh-desk-notebook-pickeritem" disabled={page.busy} onClick={() => { void page.chooseRoot(item.path) }}>
                        <span className="dsh-desk-notebook-pickertitle">{item.title}</span>
                        <span className="dsh-desk-notebook-rowpath">{item.path}</span>
                      </button>
                    ))}
              </div>
            )
          : null}
        <div className="dsh-desk-notebook-centerdivider" aria-hidden="true" />
        <p className="dsh-desk-notebook-centerhint">{t('notebook.welcomeBody')}</p>
        <p className="dsh-desk-notebook-centerhint">{t('notebook.workspaceHint')}</p>
      </div>
    </div>
  )
}

/** Notebook page body. */
export function NotebookView({ page }: { readonly page: NotebookPageController }): ReactElement {
  const { t } = page
  const [record, setRecord] = useState<ReviewHistoryEntry | null>(null)
  return (
    <div className="dsh-desk-notebookview">
      {page.error === null ? null : <p className="dsh-desk-notebook-error">{t('state.loadFailed', { message: page.error })}</p>}
      {page.notice === null ? null : <p className="dsh-desk-notebook-notice">{page.notice}</p>}
      {page.rootPath === undefined
        ? <Unlinked page={page} />
        : (
            <div className="dsh-desk-notebook-column">
              {page.newOpen ? <NewNoteForm page={page} /> : null}
              <div className="dsh-desk-notebook-toolbar">
                <Input
                  className="dsh-desk-notebook-search"
                  icon={<IconSearchOutlineRegular />}
                  value={page.query}
                  placeholder={t('notebook.searchPlaceholder')}
                  onChange={event => page.setQuery(event.target.value)}
                />
                <SegmentedTabs
                  className="dsh-desk-notebook-tabs"
                  size="sm"
                  label={t('notebook.panelLabel')}
                  value={page.mode}
                  onChange={page.setMode}
                  items={[
                    { value: 'recent', label: t('notebook.viewRecent'), id: 'desk-notebook-tab-recent', panelId: 'desk-notebook-panel' },
                    { value: 'drafts', label: t('notebook.viewDrafts', { count: page.state?.draftCount ?? 0 }), id: 'desk-notebook-tab-drafts', panelId: 'desk-notebook-panel' },
                    { value: 'history', label: t('notebook.viewHistory', { count: page.state?.historyCount ?? 0 }), id: 'desk-notebook-tab-history', panelId: 'desk-notebook-panel' },
                    { value: 'missing', label: t('notebook.viewMissing', { count: page.state?.stats.missingFrontmatter ?? 0 }), id: 'desk-notebook-tab-missing', panelId: 'desk-notebook-panel' },
                  ] as const}
                />
              </div>

              <div className="dsh-desk-notebook-listwrap">
                <div className="dsh-desk-notebook-card">
                  <div className="dsh-desk-notebook-cardhead">
                    <span className="dsh-desk-notebook-cardhead-title">{page.summary}</span>
                    {page.summaryHint === null ? null : <span className="dsh-desk-notebook-cardhead-hint">{page.summaryHint}</span>}
                    {page.mode === 'history'
                      ? (
                          <Tag tone={page.historyWarn ? 'danger' : 'neutral'} className="dsh-desk-notebook-cardhead-usage">
                            {t('notebook.historyUsage', { size: (page.historyBytes / 1024).toFixed(1) })}
                          </Tag>
                        )
                      : null}
                  </div>
                  {page.slice.rows.length === 0
                    ? <p className="dsh-desk-notebook-empty">{emptyText(page)}</p>
                    : (
                        <div className="dsh-desk-notebook-rows">
                          {page.slice.rows.map(row => (
                            <Row
                              key={row.key}
                              page={page}
                              row={row}
                              {...row.record === undefined ? {} : { onOpen: () => setRecord(row.record ?? null) }}
                            />
                          ))}
                        </div>
                      )}
                </div>
                {page.slice.pages <= 1
                  ? null
                  : (
                      <div className="dsh-desk-notebook-pager">
                        <span className="dsh-desk-notebook-pagerstatus">
                          {t('notebook.pagerStatus', { page: page.slice.page, pages: page.slice.pages })}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<IconChevronLeftOutlineMedium />}
                          aria-label={t('notebook.pagerPrev')}
                          disabled={page.slice.page <= 1}
                          onClick={() => page.setPage(page.slice.page - 1)}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<IconChevronRightOutlineRegular />}
                          aria-label={t('notebook.pagerNext')}
                          disabled={page.slice.page >= page.slice.pages}
                          onClick={() => page.setPage(page.slice.page + 1)}
                        />
                      </div>
                    )}
              </div>
            </div>
          )}
      <RecordDialog page={page} record={record} onClose={() => setRecord(null)} />
    </div>
  )
}

/** Keep the translator type referenced for documentation. */
export type { DeskTranslator }
