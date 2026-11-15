/**
 * Notebook page body: one vertical page with the search + four views joined into one strip, the
 * official "workspace files" button on its right, and the paginated list below.
 */

import { useState } from 'react'
import type { ReactElement } from 'react'
import {
  Button, IconChevronLeftOutlineMedium, IconChevronRightOutlineRegular, IconSearchOutlineRegular,
  Input, Modal, SegmentedTabs, Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { formatDateTime, formatKilobytes } from '../app/utils.js'
import { folderIcon } from '../app/icons.js'
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
          <span className="dsh-desk-notebook-recorddate">{formatDateTime(record.record.createdAt)}</span>
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

/** One compact list row: title, path, facts, optional inline delete. */
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

/** The official "workspace files" entry, styled as Desk One's white primary button. */
function WorkspaceFilesButton({ page }: { readonly page: NotebookPageController }): ReactElement {
  const { t } = page
  return (
    <button
      type="button"
      className="dsh-desk-action dsh-desk-action-primary dsh-desk-notebook-filesbtn"
      disabled={page.busy}
      onClick={() => { void page.openFolder() }}
    >
      <span className="dsh-desk-notebook-filesbtn-icon" aria-hidden="true">{folderIcon}</span>
      <span className="dsh-desk-notebook-filesbtn-text">
        <span className="dsh-desk-notebook-filesbtn-title">{t('notebook.workspaceFiles')}</span>
        <span className="dsh-desk-notebook-filesbtn-subtitle">{t('notebook.workspaceFilesHint')}</span>
      </span>
      <span className="dsh-desk-notebook-filesbtn-arrow" aria-hidden="true">
        <IconChevronRightOutlineRegular />
      </span>
    </button>
  )
}

/** Unlinked home: the workspace picker is shown by default, not behind a first click. */
function HomeBody({ page }: { readonly page: NotebookPageController }): ReactElement {
  const { t } = page
  return (
    <div className="dsh-desk-notebook-home">
      <div className="dsh-desk-notebook-card">
        {page.workspaces.length === 0
          ? <p className="dsh-desk-notebook-homeempty">{t('notebook.noWorkspace')}</p>
          : (
              <ul className="dsh-desk-notebook-homelist">
                {page.workspaces.map(item => (
                  <li key={item.workspaceId}>
                    <button
                      type="button"
                      className="dsh-desk-notebook-homerow"
                      disabled={page.busy}
                      onClick={() => { void page.chooseRoot(item.path) }}
                    >
                      <span className="dsh-desk-notebook-homerow-title">{item.title}</span>
                      <span className="dsh-desk-notebook-homerow-path">{item.path}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
      </div>
      <div className="dsh-desk-notebook-homeactions">
        <button
          type="button"
          className="dsh-desk-action"
          disabled={page.busy}
          onClick={() => { void page.pickNewWorkspace() }}
        >
          {t('notebook.createWorkspace')}
        </button>
      </div>
      <div className="dsh-desk-notebook-homehints">
        <p className="dsh-desk-page-hint">{t('notebook.welcomeBody')}</p>
      </div>
    </div>
  )
}

/** Linked list card: the head carries the count and the pager, the body the rows. */
function ListCard({ page, onRecord }: {
  readonly page: NotebookPageController
  readonly onRecord: (record: ReviewHistoryEntry) => void
}): ReactElement {
  const { t } = page
  return (
    <div className="dsh-desk-notebook-card">
      <div className="dsh-desk-notebook-cardhead">
        <span className="dsh-desk-notebook-cardhead-title">{page.summary}</span>
        {page.summaryHint === null ? null : <span className="dsh-desk-notebook-cardhead-hint">{page.summaryHint}</span>}
        <span className="dsh-desk-notebook-cardhead-spacer" />
        {page.mode === 'history'
          ? (
              <Tag tone={page.historyWarn ? 'danger' : 'neutral'} className="dsh-desk-notebook-cardhead-usage">
                {t('notebook.historyUsage', { size: formatKilobytes(page.historyBytes) })}
              </Tag>
            )
          : null}
        {page.pages <= 1
          ? null
          : (
              <span className="dsh-desk-notebook-pager">
                <span className="dsh-desk-notebook-pagerstatus">
                  {t('notebook.pagerStatus', { page: page.page, pages: page.pages })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<IconChevronLeftOutlineMedium />}
                  aria-label={t('notebook.pagerPrev')}
                  disabled={page.page <= 1}
                  onClick={() => page.setPage(page.page - 1)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<IconChevronRightOutlineRegular />}
                  aria-label={t('notebook.pagerNext')}
                  disabled={page.page >= page.pages}
                  onClick={() => page.setPage(page.page + 1)}
                />
              </span>
            )}
      </div>
      {page.rows.length === 0
        ? <p className="dsh-desk-notebook-empty">{emptyText(page)}</p>
        : (
            <div className="dsh-desk-notebook-rows">
              {page.rows.map(row => (
                <Row
                  key={row.key}
                  page={page}
                  row={row}
                  {...row.record === undefined ? {} : { onOpen: () => { if (row.record !== undefined) onRecord(row.record) } }}
                />
              ))}
            </div>
          )}
    </div>
  )
}

/** Notebook page body. */
export function NotebookView({ page }: { readonly page: NotebookPageController }): ReactElement {
  const { t } = page
  const [record, setRecord] = useState<ReviewHistoryEntry | null>(null)
  const linked = page.rootPath !== undefined
  return (
    <div className="dsh-desk-notebookview">
      {page.error === null ? null : <p className="dsh-desk-notebook-error">{t('state.loadFailed', { message: page.error })}</p>}
      {page.notice === null ? null : <p className="dsh-desk-notebook-notice">{page.notice}</p>}
      {!page.ready
        ? <div className="dsh-desk-notebook-center"><p className="dsh-desk-notebook-hint">{t('state.loading')}</p></div>
        : (
            <div className="dsh-desk-notebook-content">
              <div className="dsh-desk-notebook-toprow">
                {linked
                  ? (
                      <div className="dsh-desk-notebook-toolbar-main">
                        <Input
                          className="dsh-desk-notebook-search"
                          icon={<IconSearchOutlineRegular />}
                          value={page.query}
                          placeholder={t('notebook.searchPlaceholder')}
                          onChange={event => page.setQuery(event.target.value)}
                        />
                        <span className="dsh-desk-notebook-toolbar-divider" aria-hidden="true" />
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
                    )
                  : (
                      <div className="dsh-desk-notebook-homehead">
                        <div className="dsh-desk-notebook-homehead-top">
                          <span className="dsh-desk-notebook-homehead-title">{t('notebook.chooseWorkspace')}</span>
                          <span className="dsh-desk-notebook-homehead-count">{page.workspaces.length}</span>
                        </div>
                        <p className="dsh-desk-notebook-homehead-hint">{t('notebook.workspaceHint')}</p>
                      </div>
                    )}
                <WorkspaceFilesButton page={page} />
              </div>
              {linked
                ? <ListCard page={page} onRecord={setRecord} />
                : <HomeBody page={page} />}
            </div>
          )}
      <RecordDialog page={page} record={record} onClose={() => setRecord(null)} />
    </div>
  )
}
