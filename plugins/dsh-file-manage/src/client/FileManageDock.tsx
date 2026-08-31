/** 云端文件面板视图：入口按钮 + 弹窗（列表 / 翻页 / 删除确认 / 复制 / 配额条）；样式与请求分别在 styles.ts / api.ts。 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { IconCloseOutline16, IconFolderOpenOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { FileRow } from '../files.js'
import type { FileCountSummary } from './api.js'
import { formatUsagePercent, storageUsageRatio } from './quota.js'
import { styles } from './styles.js'

export interface FileManageDockInjected {
  listFiles: (after?: string) => Promise<{ rows: FileRow[]; hasMore: boolean; lastId?: string }>
  deleteFile: (id: string) => Promise<void>
  countFiles: () => Promise<FileCountSummary>
}

export type FileManageDockProps = PropsRuntime<'sidebar.footer.action'> & FileManageDockInjected & { t: TranslateNS<'file-manage'> }

/** 面板状态：首屏 loading / 错误横幅 / 列表 + 加载更多 / 删除确认框（web 确认框替代原生 confirm）。 */
export function FileManageDock({ wide, listFiles, deleteFile, countFiles, t }: FileManageDockProps) {
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
  const [summary, setSummary] = useState<FileCountSummary | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  /** 刷新代际：快速关/开面板产生并发请求时，只让最新一次的结果落地（陈旧响应竞态，archive 同款）。 */
  const refreshSeqRef = useRef(0)
  /** 「已复制」反馈 2s 复位（archive 同款）。 */
  const copiedTimerRef = useRef<number | null>(null)

  const loadFirst = useCallback(() => {
    const seq = ++refreshSeqRef.current
    setLoading(true)
    setError(null)
    listFiles()
      .then(page => {
        if (seq !== refreshSeqRef.current) return
        setRows(page.rows)
        setHasMore(page.hasMore)
        setLastId(page.lastId)
      })
      .catch(reason => {
        if (seq !== refreshSeqRef.current) return
        setError(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => {
        if (seq === refreshSeqRef.current) setLoading(false)
      })
  }, [listFiles])

  // 官方弹窗行为：打开时聚焦关闭按钮，Esc 关闭。
  useEffect(() => {
    if (!open) return
    closeButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open])

  useEffect(() => {
    if (!open) return
    setConfirming(null)
    setSummary(null)
    loadFirst()
    // 总数统计为 best-effort：接口失败只隐藏统计行，不影响列表；同样受刷新代际约束。
    const seq = refreshSeqRef.current
    void countFiles()
      .then(next => {
        if (seq === refreshSeqRef.current) setSummary(next)
      })
      .catch(() => {})
  }, [open, loadFirst, countFiles])

  useEffect(() => () => {
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current)
  }, [])

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
      await navigator.clipboard.writeText(row.id)
      setCopied(row.id)
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current)
      copiedTimerRef.current = window.setTimeout(() => { setCopied(null) }, 2_000)
    } catch {
      setCopied(null)
      setError(t('copyFailed'))
    }
  }, [t])

  const quotaRatio = summary === null ? 0 : storageUsageRatio(summary.totalBytes, summary.quotaBytes)

  const submitDelete = useCallback(() => {
    if (confirming === null || busyDelete) return
    setBusyDelete(true)
    deleteFile(confirming.id)
      .then(() => {
        setRows(current => current.filter(row => row.id !== confirming.id))
        setConfirming(null)
        // 删除后刷新总数（best-effort）。
        void countFiles().then(setSummary).catch(() => {})
      })
      .catch(reason => {
        setError(reason instanceof Error ? reason.message : String(reason))
        setConfirming(null)
      })
      .finally(() => { setBusyDelete(false) })
  }, [busyDelete, confirming, deleteFile, countFiles])

  return (
    <>
      <button
        type="button"
        className={wide ? 'dsh-file-manage-trigger' : 'dsh-file-manage-trigger dsh-file-manage-trigger-rail'}
        title={t('dialog.title')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setOpen(value => !value) }}
      >
        <IconFolderOpenOutline16 className="dsh-file-manage-trigger-icon" size={wide ? 16 : 18} />
        {wide ? <span className="dsh-file-manage-trigger-label">{t('button.label')}</span> : null}
      </button>
      {open ? (
        <div style={styles.overlay} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false)
        }}>
          <div style={styles.panel} role="dialog" aria-modal="true" aria-label={t('dialog.title')}>
            <div className="dsh-file-manage-panel-header">
              <h2 className="dsh-file-manage-panel-title" style={{ margin: 0 }}>{t('dialog.title')}</h2>
              <button ref={closeButtonRef} type="button" className="dsh-file-manage-close" aria-label={t('dialog.close')} onClick={() => { setOpen(false) }}>
                <IconCloseOutline16 size={14} />
              </button>
            </div>
            {summary !== null ? (
              <div className="dsh-file-manage-summary">
                <div className="dsh-file-manage-quota-track">
                  <span className="dsh-file-manage-quota-text">
                    {`${summary.totalBytesLabel} / ${summary.quotaBytesLabel} · ${t('quota.used', { percent: formatUsagePercent(quotaRatio) })}`}
                  </span>
                  {/* 零用量不渲染填充（min-width 银条只给「有使用」的状态）。 */}
                  {quotaRatio > 0
                    ? <div className="dsh-file-manage-quota-fill" style={{ width: `${Math.round(quotaRatio * 100)}%` }} />
                    : null}
                </div>
                {/* 列表翻页联动：未加载完时显示「已加载 X / 共 N」，加载完只显示总数。 */}
                <p className="dsh-file-manage-count">
                  {rows.length < summary.count
                    ? t('summary.loaded', { loaded: rows.length, count: summary.count })
                    : t('summary.count', { count: summary.count })}
                </p>
              </div>
            ) : null}
            <div style={{ ...styles.body, padding: summary !== null ? '0 24px 24px' : '12px 24px 24px' }} className="dsh-file-manage-body">
              {error !== null ? (
                <p role="alert" style={{ ...styles.secondarySmall, margin: '0 0 12px', color: 'var(--dsw-alias-state-error-primary, #c62828)' }}>
                  {error}
                  {' '}
                  <button type="button" className="dsh-file-manage-btn" onClick={loadFirst}>{t('retry')}</button>
                </p>
              ) : null}
              {loading ? <p style={styles.secondarySmall}>{t('loading')}</p> : null}
              {!loading && error === null && rows.length === 0 ? <p style={styles.secondarySmall}>{t('empty')}</p> : null}
              {rows.length > 0 ? (
                <div className="dsh-file-manage-card">
                  {rows.map(row => (
                    <div key={row.id} style={styles.row}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <span style={styles.title} title={row.filename}>{row.filename}</span>
                          {row.dshOwned ? <span className="dsh-file-manage-badge">{t('dshBadge')}</span> : null}
                        </div>
                        <div style={styles.secondarySmall}>
                          {row.sizeLabel} · {row.createdAtLabel}
                          {row.expiresAtLabel !== undefined ? ` · ${t('expires', { time: row.expiresAtLabel })}` : ''}
                        </div>
                      </div>
                      <div style={styles.actions}>
                        <button
                          type="button"
                          className="dsh-file-manage-btn"
                          onClick={() => { void copyId(row) }}
                        >
                          {copied === row.id ? t('copied') : t('copy')}
                        </button>
                        <button
                          type="button"
                          className="dsh-file-manage-btn dsh-file-manage-btn-danger"
                          onClick={() => { setConfirming(row) }}
                        >
                          {t('delete')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            {hasMore && !loading ? (
              <div style={styles.footerBar}>
                <button
                  type="button"
                  className="dsh-file-manage-btn"
                  disabled={loadingMore}
                  onClick={() => { void loadMore() }}
                >
                  {loadingMore ? t('loading') : t('loadMore')}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {confirming !== null ? (
        <div className="dsh-file-manage-confirm-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busyDelete) setConfirming(null)
        }}>
          <div
            className="dsh-file-manage-confirm-card"
            role="alertdialog"
            aria-modal="true"
            aria-label={t('delete')}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !busyDelete) {
                event.stopPropagation()
                setConfirming(null)
              }
            }}
          >
            <h3 className="dsh-file-manage-confirm-title">{t('delete')}</h3>
            <p className="dsh-file-manage-confirm-desc">
              {confirming.dshOwned
                ? t('confirm.deleteDsh', { name: confirming.filename })
                : t('confirm.delete', { name: confirming.filename })}
            </p>
            <div className="dsh-file-manage-confirm-actions">
              <button
                type="button"
                className="dsh-file-manage-btn"
                disabled={busyDelete}
                onClick={() => { setConfirming(null) }}
              >
                {t('confirm.cancel')}
              </button>
              <button
                type="button"
                className="dsh-file-manage-btn dsh-file-manage-btn-danger"
                disabled={busyDelete}
                onClick={() => { void submitDelete() }}
              >
                {busyDelete ? t('confirm.deleting') : t('confirm.confirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
