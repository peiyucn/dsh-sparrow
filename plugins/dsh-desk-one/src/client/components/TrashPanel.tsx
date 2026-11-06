/**
 * Trash view: a paged list of soft-deleted notes with restore / delete-forever actions.
 * Pagination keeps the rendered row count small (TRASH_PAGE_SIZE); deleting here is permanent.
 */

import type { ReactElement } from 'react'
import type { DeskNote } from '../../contract.js'
import type { DeskTranslator } from '../types.js'
import { formatDate } from '../utils.js'

interface TrashPanelProps {
  readonly trashedNotes: readonly DeskNote[]
  readonly visibleTrashed: readonly DeskNote[]
  readonly trashVisible: number
  readonly confirmClearTrash: boolean
  readonly t: DeskTranslator
  readonly onLoadMore: () => void
  readonly onClearTrash: () => void
  readonly onRestore: (note: DeskNote) => void
  readonly onDelete: (id: string) => void
}

export function TrashPanel({
  trashedNotes, visibleTrashed, trashVisible, confirmClearTrash, t, onLoadMore, onClearTrash, onRestore, onDelete,
}: TrashPanelProps): ReactElement {
  return (
    <div className="dsh-desk-trash">
      <div className="dsh-desk-trash-head">
        <h2 className="dsh-desk-trash-title">
          {t('trash.title')}
          {trashedNotes.length > 0
            ? <span className="dsh-desk-trash-count">{t('trash.total', { count: trashedNotes.length })}</span>
            : null}
        </h2>
        {trashedNotes.length === 0
          ? null
          : (
              <div className="dsh-desk-trash-actions">
                {trashVisible < trashedNotes.length
                  ? (
                      <button type="button" className="dsh-desk-trash-clear" onClick={onLoadMore}>
                        {t('action.loadMore')}
                      </button>
                    )
                  : null}
                <button type="button" className="dsh-desk-trash-clear" onClick={onClearTrash}>
                  {confirmClearTrash ? t('action.clearTrashConfirm') : t('action.clearTrash')}
                </button>
              </div>
            )}
      </div>
      {trashedNotes.length === 0
        ? <p className="dsh-desk-wall-hint">{t('trash.empty')}</p>
        : (
            <ul className="dsh-desk-trash-list">
              {visibleTrashed.map(note => (
                <li key={note.id} className="dsh-desk-trash-row">
                  <span className="dsh-desk-trash-dot" data-color={note.color} />
                  <span className="dsh-desk-trash-text">{note.title === '' ? t('note.placeholder') : note.title}</span>
                  <span className="dsh-desk-trash-meta">{formatDate(note.updatedAt)}</span>
                  <button
                    type="button"
                    className="dsh-desk-iconbtn"
                    aria-label={t('action.restore')}
                    title={t('action.restore')}
                    onClick={() => onRestore(note)}
                  >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                      <path d="M4.5 6.5v4h4" />
                      <path d="M5 10.3A5.2 5.2 0 1 1 6.6 13.2" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="dsh-desk-iconbtn dsh-desk-iconbtn-danger"
                    aria-label={t('action.delete')}
                    title={t('action.delete')}
                    onClick={() => onDelete(note.id)}
                  >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                      <path d="M4 6.5h12M8 6.5V5h4v1.5M6 6.5l.7 8.5h6.6l.7-8.5M8.5 9v4M11.5 9v4" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
    </div>
  )
}
