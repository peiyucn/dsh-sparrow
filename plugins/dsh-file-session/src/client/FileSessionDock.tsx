/** 云端文件管理入口：sidebar footer action + 弹窗（zh/en 双语 + loading / 错误 / 分页态）。 */

import { useCallback, useEffect, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type { FileRow } from '../files.js'

export interface FileSessionDockInjected {
  listFiles: (after?: string) => Promise<{ rows: FileRow[]; hasMore: boolean; lastId?: string }>
  deleteFile: (id: string) => Promise<void>
}

export type FileSessionDockProps = PropsRuntime<'sidebar.footer.action'> & FileSessionDockInjected & { t: TranslateNS<'file-session'> }

/** 注入触发键与面板样式（官方设计 token；按 data 属性去重）。 */
export function ensureFileSessionStyles(): void {
  if (document.querySelector('style[data-dsh-file-session]') !== null) return
  const style = document.createElement('style')
  style.dataset.dshFileSession = ''
  style.textContent = `
.dsh-file-session-trigger {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  width: calc(100% + 4px);
  height: 42px;
  margin: 4px -2px;
  padding: 0 10px 0 8px;
  box-sizing: border-box;
  border: none;
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 14px;
  line-height: 22px;
}
.dsh-file-session-trigger:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-file-session-trigger-rail {
  width: 36px;
  height: 36px;
  margin: 8px 0 10px;
  justify-content: center;
  gap: 0;
  padding: 0;
  border-radius: 50%;
}
.dsh-file-session-trigger-icon {
  flex: none;
}
.dsh-file-session-trigger-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-file-session-overlay {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 18, 25, 0.4);
}
.dsh-file-session-panel {
  display: flex;
  flex-direction: column;
  width: min(520px, calc(100vw - 48px));
  max-height: min(560px, calc(100vh - 96px));
  box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 14px;
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: var(--dsw-shadow-lv2);
  overflow: hidden;
}
.dsh-file-session-header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.dsh-file-session-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.dsh-file-session-close {
  flex: none;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}
.dsh-file-session-close:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-file-session-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px;
}
.dsh-file-session-footer {
  flex: none;
  display: flex;
  justify-content: center;
  padding: 10px 16px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.dsh-file-session-empty,
.dsh-file-session-error {
  padding: 24px 0;
  text-align: center;
  color: var(--dsw-alias-label-caption);
  font-size: 13px;
  line-height: 20px;
}
.dsh-file-session-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.dsh-file-session-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.dsh-file-session-row:last-child {
  border-bottom: none;
}
.dsh-file-session-row-main {
  min-width: 0;
}
.dsh-file-session-row-name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.dsh-file-session-row-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
}
.dsh-file-session-badge {
  flex: none;
  padding: 1px 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  color: var(--dsw-alias-label-caption);
  font-size: 11px;
  line-height: 16px;
}
.dsh-file-session-row-meta {
  margin-top: 2px;
  color: var(--dsw-alias-label-caption);
  font-size: 12px;
  line-height: 18px;
}
.dsh-file-session-row-actions {
  flex: none;
  display: flex;
  gap: 6px;
}
.dsh-file-session-btn {
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l1, #d4d8e0);
  border-radius: 999px;
  outline: none;
  background: transparent;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 13px;
  line-height: 20px;
  white-space: nowrap;
  cursor: pointer;
}
.dsh-file-session-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-file-session-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.dsh-file-session-btn-danger {
  color: var(--dsw-alias-state-error-primary, #c62828);
}
.dsh-file-session-confirm {
  margin-top: 8px;
  padding: 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
}
.dsh-file-session-confirm-text {
  white-space: pre-line;
  margin-bottom: 8px;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
}
.dsh-file-session-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
`
  document.head.appendChild(style)
}

/** 面板状态：首屏 loading / 错误横幅 / 列表 + 加载更多 / 删除确认卡。 */
export function FileSessionDock({ wide, listFiles, deleteFile, t }: FileSessionDockProps) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<readonly FileRow[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [lastId, setLastId] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<FileRow | null>(null)
  const [busyDelete, setBusyDelete] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const loadFirst = useCallback(() => {
    setLoading(true)
    setError(null)
    listFiles()
      .then(page => {
        setRows(page.rows)
        setHasMore(page.hasMore)
        setLastId(page.lastId)
      })
      .catch(reason => { setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { setLoading(false) })
  }, [listFiles])

  useEffect(() => {
    if (!open) return
    setConfirming(null)
    loadFirst()
  }, [open, loadFirst])

  const loadMore = useCallback(() => {
    if (lastId === undefined || loadingMore) return
    setLoadingMore(true)
    listFiles(lastId)
      .then(page => {
        setRows(current => [...current, ...page.rows])
        setHasMore(page.hasMore)
        setLastId(page.lastId)
      })
      .catch(reason => { setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { setLoadingMore(false) })
  }, [lastId, loadingMore, listFiles])

  const copyId = useCallback(async (row: FileRow) => {
    try {
      if (navigator.clipboard === undefined) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(row.id)
      setCopied(row.id)
    } catch {
      setCopied(null)
      setError(t('copyFailed'))
    }
  }, [t])

  const confirmDelete = useCallback(() => {
    if (confirming === null || busyDelete) return
    setBusyDelete(true)
    deleteFile(confirming.id)
      .then(() => {
        setRows(current => current.filter(row => row.id !== confirming.id))
        setConfirming(null)
      })
      .catch(reason => {
        setError(reason instanceof Error ? reason.message : String(reason))
        setConfirming(null)
      })
      .finally(() => { setBusyDelete(false) })
  }, [busyDelete, confirming, deleteFile])

  return (
    <>
      <button
        type="button"
        className={wide ? 'dsh-file-session-trigger' : 'dsh-file-session-trigger dsh-file-session-trigger-rail'}
        aria-label={t('button.label')}
        onClick={() => { setOpen(true) }}
      >
        <svg className="dsh-file-session-trigger-icon" viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden>
          <path d="M11 3H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7l-5-4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M11 3v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        {wide && <span className="dsh-file-session-trigger-label">{t('button.label')}</span>}
      </button>
      {open && (
        <div className="dsh-file-session-overlay" onClick={() => { setOpen(false) }}>
          <div
            className="dsh-file-session-panel"
            role="dialog"
            aria-modal="true"
            aria-label={t('dialog.title')}
            onClick={event => { event.stopPropagation() }}
          >
            <div className="dsh-file-session-header">
              <div className="dsh-file-session-title">{t('dialog.title')}</div>
              <button
                type="button"
                className="dsh-file-session-close"
                aria-label={t('dialog.close')}
                onClick={() => { setOpen(false) }}
              >
                ×
              </button>
            </div>
            <div className="dsh-file-session-body">
              {loading && <div className="dsh-file-session-empty">{t('loading')}</div>}
              {!loading && error !== null && (
                <div className="dsh-file-session-error">
                  <span>{error}</span>
                  <button type="button" className="dsh-file-session-btn" onClick={loadFirst}>{t('retry')}</button>
                </div>
              )}
              {!loading && error === null && rows.length === 0 && (
                <div className="dsh-file-session-empty">{t('empty')}</div>
              )}
              {rows.length > 0 && (
                <div className="dsh-file-session-list">
                  {rows.map(row => (
                    <div key={row.id} className="dsh-file-session-row">
                      <div className="dsh-file-session-row-main">
                        <div className="dsh-file-session-row-name">
                          <span className="dsh-file-session-row-title" title={row.filename}>{row.filename}</span>
                          {row.dshOwned && <span className="dsh-file-session-badge">{t('dshBadge')}</span>}
                        </div>
                        <div className="dsh-file-session-row-meta">
                          {row.sizeLabel} · {row.createdAtLabel}
                          {row.expiresAtLabel !== undefined ? ` · ${t('expires', { time: row.expiresAtLabel })}` : ''}
                        </div>
                      </div>
                      <div className="dsh-file-session-row-actions">
                        <button
                          type="button"
                          className="dsh-file-session-btn"
                          onClick={() => { void copyId(row) }}
                        >
                          {copied === row.id ? t('copied') : t('copy')}
                        </button>
                        <button
                          type="button"
                          className="dsh-file-session-btn dsh-file-session-btn-danger"
                          onClick={() => { setConfirming(row) }}
                        >
                          {t('delete')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {confirming !== null && (
                <div className="dsh-file-session-confirm">
                  <div className="dsh-file-session-confirm-text">
                    {confirming.dshOwned
                      ? t('confirm.deleteDsh', { name: confirming.filename })
                      : t('confirm.delete', { name: confirming.filename })}
                  </div>
                  <div className="dsh-file-session-confirm-actions">
                    <button
                      type="button"
                      className="dsh-file-session-btn"
                      disabled={busyDelete}
                      onClick={() => { setConfirming(null) }}
                    >
                      {t('confirm.cancel')}
                    </button>
                    <button
                      type="button"
                      className="dsh-file-session-btn dsh-file-session-btn-danger"
                      disabled={busyDelete}
                      onClick={() => { void confirmDelete() }}
                    >
                      {busyDelete ? t('confirm.deleting') : t('confirm.confirm')}
                    </button>
                  </div>
                </div>
              )}
            </div>
            {hasMore && !loading && (
              <div className="dsh-file-session-footer">
                <button
                  type="button"
                  className="dsh-file-session-btn"
                  disabled={loadingMore}
                  onClick={() => { void loadMore() }}
                >
                  {loadingMore ? t('loading') : t('loadMore')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
