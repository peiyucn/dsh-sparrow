/** 归档会话管理入口：sidebar footer action + 弹窗（zh/en 双语 + loading 态）。 */

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { IconArchiveOutline20, IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'

export interface ArchivedSessionItem {
  readonly sessionId: string
  readonly title: string
  readonly updatedAt: number
  readonly live: boolean
  readonly running: boolean
  readonly backendSupported: boolean
  readonly workspaceIds: readonly string[]
}

export interface BackupItem {
  readonly backupId: string
  readonly sessionId: string
  readonly title: string
  readonly archivedAt: string
  readonly legacy: boolean
}

export interface ArchiveDockInjected {
  listArchived: () => Promise<ArchivedSessionItem[]>
  listBackups: () => Promise<BackupItem[]>
  backupSession: (sessionId: string) => Promise<unknown>
  deleteSession: (sessionId: string, confirmTitle: string) => Promise<unknown>
  restoreBackup: (backupId: string) => Promise<unknown>
  deleteBackup: (backupId: string) => Promise<unknown>
  restoreAllBackups: () => Promise<{ restored?: string[]; skippedLegacy?: number; failed?: Array<{ backupId: string; message: string }> }>
  deleteAllBackups: () => Promise<{ deleted?: number; failed?: string[] }>
}

export type ArchiveDockProps = PropsRuntime<'sidebar.footer.action'> & ArchiveDockInjected & { t: TranslateNS<'archive-session'> }

/** 注入侧边栏 footer 触发键样式（对齐官方 settings 触发键：透明底、圆角、悬停亮底、rail 圆形）。 */
export function ensureArchiveStyles(): void {
  if (document.querySelector('style[data-dsh-archive-trigger]') !== null) return
  const style = document.createElement('style')
  style.dataset.dshArchiveTrigger = ''
  style.textContent = `
.dsh-archive-trigger {
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
.dsh-archive-trigger:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-archive-trigger-rail {
  width: 36px;
  height: 36px;
  margin: 8px 0 10px;
  justify-content: center;
  gap: 0;
  padding: 0;
  border-radius: 50%;
}
.dsh-archive-btn {
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
.dsh-archive-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-archive-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.dsh-archive-btn-danger {
  color: var(--dsw-alias-state-error-primary, #c62828);
}
.dsh-archive-panel-header {
  flex: none;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  height: 54px;
  padding: 20px 14px 8px 10px;
  box-sizing: border-box;
}
.dsh-archive-panel-title {
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: var(--dsw-alias-label-primary);
}
.dsh-archive-close {
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
.dsh-archive-close:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-archive-section {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 40px;
  padding: 0 12px;
  margin: 0 0 4px -12px;
  box-sizing: border-box;
  border: none;
  outline: none;
  border-radius: 12px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
  text-align: left;
  cursor: pointer;
}
.dsh-archive-section:hover {
  background: var(--dsw-alias-interactive-bg-hover);
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
    height: 'min(800px, calc(100vh - 48px))',
    borderRadius: 24,
    overflow: 'hidden',
    padding: 0,
    background: 'var(--dsw-alias-bg-layer-2, #f6f7f9)',
    color: 'var(--dsw-alias-label-primary, #1f2329)',
    boxShadow: 'var(--dsw-shadow-lv3, 0 12px 40px rgba(0,0,0,0.22))',
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
  secondary: {
    color: 'var(--dsw-alias-label-secondary, #6b7280)',
  } satisfies CSSProperties,
  secondarySmall: {
    color: 'var(--dsw-alias-label-secondary, #6b7280)',
    fontSize: 12,
  } satisfies CSSProperties,
} as const

/**
 * footer action 组件：窄栏显示图标，宽栏显示「归档管理」；弹窗列出轻归档会话与备份。
 * 打开后先显示加载态，数据就绪后再渲染列表。
 * @param props - slot props + 注入动作。
 */
export function ArchiveDock(props: ArchiveDockProps) {
  const { wide, listArchived, listBackups, backupSession, deleteSession, restoreBackup, deleteBackup, restoreAllBackups, deleteAllBackups, t } = props
  const [open, setOpen] = useState(false)
  const [archived, setArchived] = useState<ArchivedSessionItem[]>([])
  const [backups, setBackups] = useState<BackupItem[]>([])
  const [archivedOpen, setArchivedOpen] = useState(true)
  const [backupsOpen, setBackupsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

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

  const refresh = async (): Promise<void> => {
    setLoading(true)
    try {
      const [nextArchived, nextBackups] = await Promise.all([listArchived(), listBackups()])
      setArchived(nextArchived)
      setBackups(nextBackups)
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    void refresh()
  }, [open])

  const run = async (key: string, action: () => Promise<unknown>): Promise<void> => {
    setBusy(key)
    setError(null)
    try {
      await action()
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(current => current === key ? null : current)
    }
  }

  const confirmBackup = (item: ArchivedSessionItem): void => {
    const ok = window.confirm(t('confirm.backup', { name: item.title }))
    if (!ok) return
    void run(`backup:${item.sessionId}`, () => backupSession(item.sessionId))
  }

  const confirmDelete = (item: ArchivedSessionItem): void => {
    const typed = window.prompt(t('confirm.delete', { name: item.title }))
    if (typed === null) return
    if (typed.trim() !== item.title.trim()) {
      setError(t('confirm.deleteMismatch'))
      return
    }
    void run(`delete:${item.sessionId}`, () => deleteSession(item.sessionId, typed))
  }

  const confirmDeleteBackup = (item: BackupItem): void => {
    const ok = window.confirm(t('confirm.deleteBackup', { name: item.title }))
    if (!ok) return
    void run(`backupDelete:${item.backupId}`, () => deleteBackup(item.backupId))
  }

  const restorableCount = backups.filter(item => !item.legacy).length
  const legacyCount = backups.length - restorableCount

  const confirmRestoreAll = (): void => {
    const ok = window.confirm(legacyCount > 0
      ? t('confirm.restoreAll.withLegacy', { count: restorableCount, legacy: legacyCount })
      : t('confirm.restoreAll', { count: restorableCount }))
    if (!ok) return
    void (async () => {
      setBusy('restoreAll')
      setError(null)
      setNotice(null)
      try {
        const result = await restoreAllBackups()
        const parts = [t('notice.restored', { count: result.restored?.length ?? 0 })]
        const skipped = result.skippedLegacy ?? 0
        const failed = result.failed?.length ?? 0
        if (skipped > 0) parts.push(t('notice.skippedLegacy', { count: skipped }))
        if (failed > 0) parts.push(t('notice.failed', { count: failed }))
        setNotice(parts.join(' · '))
        await refresh()
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason))
      } finally {
        setBusy(current => current === 'restoreAll' ? null : current)
      }
    })()
  }

  const confirmDeleteAll = (): void => {
    const phrase = t('confirm.deleteAllPhrase')
    const typed = window.prompt(t('confirm.deleteAll', { count: backups.length, phrase }))
    if (typed === null) return
    if (typed.trim() !== phrase) {
      setError(t('confirm.deleteAllMismatch', { phrase }))
      return
    }
    void (async () => {
      setBusy('deleteAll')
      setError(null)
      setNotice(null)
      try {
        const result = await deleteAllBackups()
        const parts = [t('notice.deleted', { count: result.deleted ?? 0 })]
        const failed = result.failed?.length ?? 0
        if (failed > 0) parts.push(t('notice.failed', { count: failed }))
        setNotice(parts.join(' · '))
        await refresh()
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason))
      } finally {
        setBusy(current => current === 'deleteAll' ? null : current)
      }
    })()
  }

  const loadingRow = (
    <p style={styles.secondarySmall}>{t('loading')}</p>
  )

  return (
    <>
      <button
        type="button"
        className={wide ? 'dsh-archive-trigger' : 'dsh-archive-trigger dsh-archive-trigger-rail'}
        title={t('dialog.title')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setOpen(value => !value) }}
      >
        <IconArchiveOutline20 size={wide ? 16 : 18} />
        {wide ? <span>{t('button.label')}</span> : null}
      </button>

      {open ? (
        <div style={styles.overlay} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false)
        }}>
          <div style={styles.panel} role="dialog" aria-modal="true" aria-label={t('dialog.title')}>
            <div className="dsh-archive-panel-header">
              <h2 className="dsh-archive-panel-title" style={{ margin: 0 }}>{t('dialog.title')}</h2>
              <button ref={closeButtonRef} type="button" className="dsh-archive-close" aria-label={t('dialog.close')} onClick={() => { setOpen(false) }}>
                <IconCloseOutline16 size={14} />
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 24px 24px' }}>
            <p style={{ ...styles.secondarySmall, fontSize: 14, lineHeight: 22, margin: '0 0 12px' }}>
              {t('dialog.intro')}
            </p>
            {error !== null ? <p role="alert" style={{ color: 'var(--dsw-alias-state-error-primary, #c62828)' }}>{error}</p> : null}

            <button
              type="button"
              className="dsh-archive-section"
              aria-expanded={archivedOpen}
              onClick={() => { setArchivedOpen(value => !value) }}
            >
              <span aria-hidden>{archivedOpen ? '▾' : '▸'}</span>
              <span>{t('section.archived', { count: loading ? '…' : archived.length })}</span>
            </button>
            {archivedOpen ? (
              <>
                {loading ? loadingRow : null}
                {!loading && archived.length === 0 ? <p style={styles.secondarySmall}>{t('empty.archived')}</p> : null}
                {!loading && archived.map(item => (
                  <div key={item.sessionId} style={styles.row}>
                    <div style={{ minWidth: 0 }}>
                      <div style={styles.title} title={item.title}>{item.title}</div>
                      <div style={styles.secondarySmall}>
                        {item.sessionId}
                        {item.running ? ` · ${t('state.running')}` : item.live ? ` · ${t('state.live')}` : ''}
                        {item.backendSupported ? '' : ` · ${t('state.backendUnsupported')}`}
                      </div>
                    </div>
                    <div style={styles.actions}>
                      <button
                        type="button"
                        className="dsh-archive-btn"
                        disabled={busy !== null || loading || !item.backendSupported}
                        onClick={() => { confirmBackup(item) }}
                      >
                        {t('action.backup')}
                      </button>
                      <button
                        type="button"
                        className="dsh-archive-btn dsh-archive-btn-danger"
                        disabled={busy !== null || loading || !item.backendSupported}
                        onClick={() => { confirmDelete(item) }}
                      >
                        {t('action.delete')}
                      </button>
                    </div>
                  </div>
                ))}
              </>
            ) : null}

            <button
              type="button"
              className="dsh-archive-section"
              aria-expanded={backupsOpen}
              onClick={() => { setBackupsOpen(value => !value) }}
            >
              <span aria-hidden>{backupsOpen ? '▾' : '▸'}</span>
              <span>{t('section.backups', { count: loading ? '…' : backups.length })}</span>
            </button>
            {notice !== null ? <p style={styles.secondarySmall}>{notice}</p> : null}
            {backupsOpen ? (
              <>
                {loading ? loadingRow : null}
                {!loading && backups.length > 0 ? (
                  <div style={{ ...styles.actions, padding: '4px 0 8px' }}>
                    <button
                      type="button"
                      className="dsh-archive-btn"
                      disabled={busy !== null || restorableCount === 0}
                      onClick={() => { confirmRestoreAll() }}
                    >
                      {t('action.restoreAll', { count: restorableCount })}
                    </button>
                    <button
                      type="button"
                      className="dsh-archive-btn dsh-archive-btn-danger"
                      disabled={busy !== null || backups.length === 0}
                      onClick={() => { confirmDeleteAll() }}
                    >
                      {t('action.deleteAll')}
                    </button>
                  </div>
                ) : null}
                {!loading && backups.length === 0 ? <p style={styles.secondarySmall}>{t('empty.backups')}</p> : null}
                {!loading && backups.some(item => item.legacy) ? (
                  <p style={styles.secondarySmall}>
                    {t('legacy.hint')}
                  </p>
                ) : null}
                {!loading && backups.map(item => (
                  <div key={item.backupId} style={styles.row}>
                    <div style={{ minWidth: 0 }}>
                      <div style={styles.title} title={item.title}>{item.title}</div>
                      <div style={styles.secondarySmall}>
                        {item.legacy ? `${t('legacy.badge')} · ` : ''}{item.archivedAt} · {item.sessionId}
                      </div>
                    </div>
                    <div style={styles.actions}>
                      <button
                        type="button"
                        className="dsh-archive-btn"
                        disabled={busy !== null || item.legacy}
                        title={item.legacy ? t('legacy.restoreTitle') : undefined}
                        onClick={() => { void run(`restore:${item.backupId}`, () => restoreBackup(item.backupId)) }}
                      >
                        {t('action.restore')}
                      </button>
                      <button
                        type="button"
                        className="dsh-archive-btn dsh-archive-btn-danger"
                        disabled={busy !== null}
                        onClick={() => { confirmDeleteBackup(item) }}
                      >
                        {t('action.delete')}
                      </button>
                    </div>
                  </div>
                ))}
              </>
            ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
