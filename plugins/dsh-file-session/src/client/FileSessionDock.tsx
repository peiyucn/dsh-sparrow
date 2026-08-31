/** 云端文件管理入口：sidebar footer action + 弹窗（zh/en 双语 + loading / 错误 / 分页态；面板样式对齐官方 Settings / Archive）。 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { IconCloseOutline16, IconFolderOpenOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { FileRow } from '../files.js'
import { formatUsagePercent, storageUsageRatio } from './quota.js'

/** 总数统计（含配额，供网盘式进度条）。 */
export interface FileCountSummary {
  count: number
  totalBytes: number
  totalBytesLabel: string
  quotaBytes: number
  quotaBytesLabel: string
  quotaCount: number
}

export interface FileSessionDockInjected {
  listFiles: (after?: string) => Promise<{ rows: FileRow[]; hasMore: boolean; lastId?: string }>
  deleteFile: (id: string) => Promise<void>
  countFiles: () => Promise<FileCountSummary>
}

export type FileSessionDockProps = PropsRuntime<'sidebar.footer.action'> & FileSessionDockInjected & { t: TranslateNS<'file-session'> }

/** 注入触发键 / 面板 / 确认框样式（官方设计 token；按 data 属性去重）。 */
export function ensureFileSessionStyles(): void {
  if (document.querySelector('style[data-dsh-file-session]') !== null) return
  const style = document.createElement('style')
  style.dataset.dshFileSession = ''
  style.textContent = `
/* 官方 .footerActions 是横向 flex 行，slot 包裹层为行内 display:contents：
 * 多插件各自的全宽按钮会并排挤到右缘外（只剩一条边）。这里把包裹层改回真实盒子纵排，
 * Archive / 云端文件两个按钮上下堆叠、各自占满一行（!important 压过行内 contents）。 */
[data-slot='sidebar.footer.action'] {
  display: flex !important;
  flex-direction: column;
  /* 包裹层是 .footerActions 行容器里的 flex item，需显式撑满，否则两个全宽按钮按内容宽度收缩。 */
  width: 100%;
}
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
/* 面板滚动区：官方 settings 同款——elevated surface 重绑 l2 滚动条 token（base 默认 l1，浮层上对比度不对）。 */
.dsh-file-session-body {
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
}
/* 面板头：官方 settings 面板同款（54px 高、标题起点 24px）。 */
.dsh-file-session-panel-header {
  flex: none;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  height: 54px;
  padding: 20px 14px 8px 24px;
  box-sizing: border-box;
}
.dsh-file-session-panel-title {
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: var(--dsw-alias-label-primary);
}
.dsh-file-session-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 28px;
  outline: none;
  background: transparent;
  cursor: pointer;
  color: var(--dsw-alias-label-primary);
}
.dsh-file-session-close:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-file-session-badge {
  flex: none;
  padding: 1px 6px;
  border: 1px solid var(--dsw-alias-border-l2, #e2e5ea);
  border-radius: 999px;
  color: var(--dsw-alias-label-caption, #8a919f);
  font-size: 11px;
  line-height: 16px;
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
/* 删除确认框：官方 web 确认框同款（mask + 毛玻璃 + 480 卡片）。 */
.dsh-file-session-confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.28));
  backdrop-filter: var(--dsw-mask-blur);
}
.dsh-file-session-confirm-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(480px, calc(100vw - 48px));
  padding: 20px;
  border-radius: 16px;
  background: var(--dsw-alias-bg-layer-2, #f6f7f9);
  color: var(--dsw-alias-label-primary, #1f2329);
  box-shadow: var(--dsw-shadow-lv3, 0 12px 40px rgba(0,0,0,0.22));
}
.dsh-file-session-confirm-title {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
}
.dsh-file-session-confirm-desc {
  margin: 0;
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  white-space: pre-line;
}
.dsh-file-session-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
/* 用量/进度条固定区：面板头下方、不随列表滚动；左右 24px 与下方区块卡线框齐平。 */
.dsh-file-session-summary {
  flex: none;
  padding: 12px 24px 8px;
}
.dsh-file-session-count {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
/* 列表区块卡：存档页归档区/备份区同款 token（border-l2 + r12）。 */
.dsh-file-session-card {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  margin: 0 0 12px;
  padding: 8px 12px 12px;
  border: 1px solid var(--dsw-alias-border-l2, #e2e5ea);
  border-radius: 12px;
}
/* 配额容量条：加厚 + 未使用区斜纹（repeating-linear-gradient），与分割线区分；填充盖住斜纹。
   容量文字绝对定位居中叠加在条上。 */
.dsh-file-session-quota-track {
  position: relative;
  height: 14px;
  border-radius: 7px;
  background-color: var(--dsw-alias-interactive-bg-hover);
  background-image: repeating-linear-gradient(
    45deg,
    transparent 0px,
    transparent 5px,
    var(--dsw-alias-border-l1, #d4d8e0) 5px,
    var(--dsw-alias-border-l1, #d4d8e0) 7px
  );
  overflow: hidden;
}
.dsh-file-session-quota-text {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  line-height: 14px;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary, #1f2329);
  /* 高用量时蓝填充垫底，加一圈底色光晕保证可读。 */
  text-shadow: 0 0 4px var(--dsw-alias-bg-layer-2, #f6f7f9);
  pointer-events: none;
}
.dsh-file-session-quota-fill {
  height: 100%;
  /* 用量极小时（0.01% 量级）宽度趋近 0，兜底 3px 银条让「有使用」可见（网盘同款）。
     不加自身圆角：最小宽度下 3px 圆角会长成圆点、视觉鼓出轨道左端，改由轨道 overflow:hidden + 圆角裁切两端。 */
  min-width: 4px;
  background: var(--dsw-alias-state-business-primary);
  transition: width 220ms ease-out;
}
`
  document.head.appendChild(style)
}

const styles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.28))',
    backdropFilter: 'var(--dsw-mask-blur)',
  } satisfies CSSProperties,
  panel: {
    position: 'relative' as const,
    display: 'flex',
    flexDirection: 'column',
    width: 'min(800px, calc(100vw - 48px))',
    // 高度随内容自适应、上限钳到视口（官方 settings 同款上限）。
    maxHeight: 'min(800px, calc(100vh - 48px))',
    borderRadius: 24,
    overflow: 'hidden',
    padding: 0,
    background: 'var(--dsw-alias-bg-layer-2, #f6f7f9)',
    color: 'var(--dsw-alias-label-primary, #1f2329)',
    boxShadow: 'var(--dsw-shadow-lv3, 0 12px 40px rgba(0,0,0,0.22))',
  } satisfies CSSProperties,
  body: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    padding: '0 24px 24px',
  } satisfies CSSProperties,
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid var(--dsw-alias-border-l1, #e2e5ea)',
  } satisfies CSSProperties,
  actions: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  } satisfies CSSProperties,
  title: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } satisfies CSSProperties,
  secondarySmall: {
    color: 'var(--dsw-alias-label-secondary, #6b7280)',
    fontSize: 12,
    lineHeight: '18px',
  } satisfies CSSProperties,
  footerBar: {
    flex: 'none',
    display: 'flex',
    justifyContent: 'center',
    // 列表已包区块卡，不再加顶部分隔线（避免与卡片叠加显乱）。
    padding: '10px 24px 14px',
  } satisfies CSSProperties,
} as const

/** 面板状态：首屏 loading / 错误横幅 / 列表 + 加载更多 / 删除确认框（web 确认框替代原生 confirm）。 */
export function FileSessionDock({ wide, listFiles, deleteFile, countFiles, t }: FileSessionDockProps) {
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
    // 总数统计为 best-effort：接口失败只隐藏统计行，不影响列表。
    void countFiles().then(setSummary).catch(() => {})
  }, [open, loadFirst, countFiles])

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
  }, [busyDelete, confirming, deleteFile])

  return (
    <>
      <button
        type="button"
        className={wide ? 'dsh-file-session-trigger' : 'dsh-file-session-trigger dsh-file-session-trigger-rail'}
        title={t('dialog.title')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setOpen(value => !value) }}
      >
        <IconFolderOpenOutline16 className="dsh-file-session-trigger-icon" size={wide ? 16 : 18} />
        {wide ? <span className="dsh-file-session-trigger-label">{t('button.label')}</span> : null}
      </button>
      {open ? (
        <div style={styles.overlay} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false)
        }}>
          <div style={styles.panel} role="dialog" aria-modal="true" aria-label={t('dialog.title')}>
            <div className="dsh-file-session-panel-header">
              <h2 className="dsh-file-session-panel-title" style={{ margin: 0 }}>{t('dialog.title')}</h2>
              <button ref={closeButtonRef} type="button" className="dsh-file-session-close" aria-label={t('dialog.close')} onClick={() => { setOpen(false) }}>
                <IconCloseOutline16 size={14} />
              </button>
            </div>
            {summary !== null ? (
              <div className="dsh-file-session-summary">
                <div className="dsh-file-session-quota-track">
                  <span className="dsh-file-session-quota-text">
                    {`${summary.totalBytesLabel} / ${summary.quotaBytesLabel} · ${t('quota.used', { percent: formatUsagePercent(quotaRatio) })}`}
                  </span>
                  {/* 零用量不渲染填充（min-width 银条只给「有使用」的状态）。 */}
                  {quotaRatio > 0
                    ? <div className="dsh-file-session-quota-fill" style={{ width: `${Math.round(quotaRatio * 100)}%` }} />
                    : null}
                </div>
                {/* 列表翻页联动：未加载完时显示「已加载 X / 共 N」，加载完只显示总数。 */}
                <p className="dsh-file-session-count">
                  {rows.length < summary.count
                    ? t('summary.loaded', { loaded: rows.length, count: summary.count })
                    : t('summary.count', { count: summary.count })}
                </p>
              </div>
            ) : null}
            <div style={{ ...styles.body, padding: summary !== null ? '0 24px 24px' : '12px 24px 24px' }} className="dsh-file-session-body">
              {error !== null ? (
                <p role="alert" style={{ ...styles.secondarySmall, margin: '0 0 12px', color: 'var(--dsw-alias-state-error-primary, #c62828)' }}>
                  {error}
                  {' '}
                  <button type="button" className="dsh-file-session-btn" onClick={loadFirst}>{t('retry')}</button>
                </p>
              ) : null}
              {loading ? <p style={styles.secondarySmall}>{t('loading')}</p> : null}
              {!loading && error === null && rows.length === 0 ? <p style={styles.secondarySmall}>{t('empty')}</p> : null}
              {rows.length > 0 ? (
                <div className="dsh-file-session-card">
                  {rows.map(row => (
                    <div key={row.id} style={styles.row}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <span style={styles.title} title={row.filename}>{row.filename}</span>
                          {row.dshOwned ? <span className="dsh-file-session-badge">{t('dshBadge')}</span> : null}
                        </div>
                        <div style={styles.secondarySmall}>
                          {row.sizeLabel} · {row.createdAtLabel}
                          {row.expiresAtLabel !== undefined ? ` · ${t('expires', { time: row.expiresAtLabel })}` : ''}
                        </div>
                      </div>
                      <div style={styles.actions}>
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
              ) : null}
            </div>
            {hasMore && !loading ? (
              <div style={styles.footerBar}>
                <button
                  type="button"
                  className="dsh-file-session-btn"
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
        <div className="dsh-file-session-confirm-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busyDelete) setConfirming(null)
        }}>
          <div
            className="dsh-file-session-confirm-card"
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
            <h3 className="dsh-file-session-confirm-title">{t('delete')}</h3>
            <p className="dsh-file-session-confirm-desc">
              {confirming.dshOwned
                ? t('confirm.deleteDsh', { name: confirming.filename })
                : t('confirm.delete', { name: confirming.filename })}
            </p>
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
