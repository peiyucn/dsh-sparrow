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
  /** 备份实际存放目录（绝对路径），面板提示信息里明示卸载影响。 */
  backupDirPath: () => Promise<string>
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
  /* 标题文字起点 24px：对齐官方 settings 面板 navTitle（rail 12px + title 12px）。 */
  padding: 20px 14px 8px 24px;
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
  /* 官方 settings 导航单元规格：pad (9,16,9,12)、字重 400。 */
  padding: 9px 16px 9px 12px;
  margin: 0 0 4px -12px;
  box-sizing: border-box;
  border: none;
  outline: none;
  border-radius: 12px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
  text-align: left;
  cursor: pointer;
}
.dsh-archive-section:hover {
  background: var(--dsw-specific-sidebar-nav-item-hover, var(--dsw-alias-interactive-bg-hover));
}
/* web 确认框：替代 window.confirm/prompt（webview 里原生 prompt 被禁用，删除按钮点不动）。 */
.dsh-archive-confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.28));
  backdrop-filter: var(--dsw-mask-blur);
}
.dsh-archive-confirm-card {
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
.dsh-archive-confirm-title {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
}
.dsh-archive-confirm-desc {
  margin: 0;
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  white-space: pre-line;
}
.dsh-archive-confirm-input {
  box-sizing: border-box;
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l1, #d4d8e0);
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 13px;
  line-height: 20px;
  outline: none;
}
.dsh-archive-confirm-input:focus {
  border-color: var(--dsw-alias-button-info-fill, #4d6bfe);
}
.dsh-archive-confirm-hint {
  margin: -4px 0 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-state-error-primary, #c62828);
}
.dsh-archive-confirm-status {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-archive-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
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
    // 高度随内容自适应、上限钳到视口：列表短时不再留一大片空白底（官方 settings 固定高是因为有导航栏 + 长选项区，本面板是短列表）。
    maxHeight: 'min(800px, calc(100vh - 48px))',
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

/** 待确认动作（web 确认框状态）。 */
type PendingConfirm =
  | { readonly kind: 'backup'; readonly item: ArchivedSessionItem }
  | { readonly kind: 'delete'; readonly item: ArchivedSessionItem }
  | { readonly kind: 'deleteBackup'; readonly item: BackupItem }
  | { readonly kind: 'restoreAll'; readonly restorable: number; readonly legacy: number }
  | { readonly kind: 'deleteAll'; readonly count: number }

interface ArchiveConfirmProps {
  readonly pending: PendingConfirm
  readonly t: TranslateNS<'archive-session'>
  readonly onCancel: () => void
  /** 执行动作；成功后父级关闭弹窗，失败 reject 并把错误显示在弹窗内。 */
  readonly onSubmit: (typed: string) => Promise<void>
}

/** web 确认框：替代 window.confirm/prompt；提交后在弹窗内展示处理中，成功后自动关闭。 */
function ArchiveConfirm(props: ArchiveConfirmProps) {
  const { pending, t, onCancel, onSubmit } = props
  const [typed, setTyped] = useState('')
  const [working, setWorking] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const needsTyping = pending.kind === 'delete' || pending.kind === 'deleteAll'
  const phrase = t('confirm.deleteAllPhrase')
  const expected = pending.kind === 'delete' ? pending.item.title.trim() : pending.kind === 'deleteAll' ? phrase : ''
  const title = pending.kind === 'backup' ? t('action.backup')
    : pending.kind === 'delete' || pending.kind === 'deleteBackup' ? t('action.delete')
      : pending.kind === 'restoreAll' ? t('action.restoreAll', { count: pending.restorable })
        : t('action.deleteAll')
  const description = pending.kind === 'backup' ? t('confirm.backup', { name: pending.item.title })
    : pending.kind === 'delete' ? t('confirm.delete', { name: pending.item.title })
      : pending.kind === 'deleteBackup' ? t('confirm.deleteBackup', { name: pending.item.title })
        : pending.kind === 'restoreAll'
          ? (pending.legacy > 0
            ? t('confirm.restoreAll.withLegacy', { count: pending.restorable, legacy: pending.legacy })
            : t('confirm.restoreAll', { count: pending.restorable }))
          : t('confirm.deleteAll', { count: pending.count, phrase })
  const workingText = pending.kind === 'backup' ? t('confirm.backingUp')
    : pending.kind === 'restoreAll' ? t('confirm.restoring')
      : t('confirm.deleting')
  const ready = !working && (!needsTyping || typed.trim() === expected)
  const mismatch = !working && needsTyping && typed.trim() !== '' && typed.trim() !== expected

  useEffect(() => {
    setTyped('')
    setWorking(false)
    setFailure(null)
  }, [pending])

  const submit = (): void => {
    if (!ready) return
    setWorking(true)
    setFailure(null)
    void onSubmit(typed).catch((reason: unknown) => {
      setWorking(false)
      setFailure(reason instanceof Error ? reason.message : String(reason))
    })
  }

  return (
    <div className="dsh-archive-confirm-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !working) onCancel()
    }}>
      <div
        className="dsh-archive-confirm-card"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !working) {
            event.stopPropagation()
            onCancel()
          } else if (event.key === 'Enter' && ready) {
            event.stopPropagation()
            submit()
          }
        }}
      >
        <h3 className="dsh-archive-confirm-title">{title}</h3>
        <p className="dsh-archive-confirm-desc">{description}</p>
        {needsTyping ? (
          <>
            <input
              className="dsh-archive-confirm-input"
              type="text"
              value={typed}
              placeholder={pending.kind === 'delete' ? pending.item.title : phrase}
              disabled={working}
              autoFocus
              onChange={(event) => { setTyped(event.currentTarget.value) }}
            />
            {mismatch ? (
              <p className="dsh-archive-confirm-hint" role="alert">
                {pending.kind === 'delete' ? t('confirm.deleteMismatch') : t('confirm.deleteAllMismatch', { phrase })}
              </p>
            ) : null}
          </>
        ) : null}
        {working ? <p className="dsh-archive-confirm-status">{workingText}</p> : null}
        {failure !== null ? <p className="dsh-archive-confirm-hint" role="alert">{failure}</p> : null}
        <div className="dsh-archive-confirm-actions">
          <button type="button" className="dsh-archive-btn" disabled={working} onClick={onCancel}>{t('confirm.cancel')}</button>
          <button type="button" className="dsh-archive-btn dsh-archive-btn-danger" disabled={!ready} onClick={submit}>{title}</button>
        </div>
      </div>
    </div>
  )
}

/**
 * footer action 组件：窄栏显示图标，宽栏显示「归档管理」；弹窗列出轻归档会话与备份。
 * 打开后先显示加载态，数据就绪后再渲染列表。
 * @param props - slot props + 注入动作。
 */
export function ArchiveDock(props: ArchiveDockProps) {
  const { wide, listArchived, listBackups, backupDirPath, backupSession, deleteSession, restoreBackup, deleteBackup, restoreAllBackups, deleteAllBackups, t } = props
  const [open, setOpen] = useState(false)
  const [archived, setArchived] = useState<ArchivedSessionItem[]>([])
  const [backups, setBackups] = useState<BackupItem[]>([])
  const [backupDir, setBackupDir] = useState<string | null>(null)
  const [archivedOpen, setArchivedOpen] = useState(true)
  const [backupsOpen, setBackupsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingConfirm | null>(null)
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
      const [nextArchived, nextBackups, nextBackupDir] = await Promise.all([
        listArchived(),
        listBackups(),
        backupDirPath().catch(() => null),
      ])
      setArchived(nextArchived)
      setBackups(nextBackups)
      setBackupDir(nextBackupDir)
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

  const confirmBackup = (item: ArchivedSessionItem): void => {
    setPending({ kind: 'backup', item })
  }

  const confirmDelete = (item: ArchivedSessionItem): void => {
    setPending({ kind: 'delete', item })
  }

  const confirmDeleteBackup = (item: BackupItem): void => {
    setPending({ kind: 'deleteBackup', item })
  }

  const restorableCount = backups.filter(item => !item.legacy).length
  const legacyCount = backups.length - restorableCount

  const confirmRestoreAll = (): void => {
    setPending({ kind: 'restoreAll', restorable: restorableCount, legacy: legacyCount })
  }

  const confirmDeleteAll = (): void => {
    setPending({ kind: 'deleteAll', count: backups.length })
  }

  /**
   * 确认框提交：动作全程在弹窗内展示处理中，成功后由这里关闭弹窗；
   * 失败（含批量部分失败）reject 回弹窗展示错误。
   */
  const submitConfirm = async (typed: string): Promise<void> => {
    if (pending === null) return
    const kind = pending.kind
    if (kind === 'backup') {
      await backupSession(pending.item.sessionId)
      await refresh()
      setPending(null)
      return
    }
    if (kind === 'delete') {
      await deleteSession(pending.item.sessionId, typed)
      await refresh()
      setPending(null)
      return
    }
    if (kind === 'deleteBackup') {
      await deleteBackup(pending.item.backupId)
      await refresh()
      setPending(null)
      return
    }
    if (kind === 'restoreAll') {
      const result = await restoreAllBackups()
      const problems: string[] = []
      const skipped = result.skippedLegacy ?? 0
      const failed = result.failed?.length ?? 0
      if (skipped > 0) problems.push(t('notice.skippedLegacy', { count: skipped }))
      if (failed > 0) problems.push(t('notice.failed', { count: failed }))
      await refresh()
      if (problems.length > 0) throw new Error(problems.join(' · '))
      setPending(null)
      return
    }
    const result = await deleteAllBackups()
    const problems: string[] = []
    const failed = result.failed?.length ?? 0
    if (failed > 0) problems.push(t('notice.failed', { count: failed }))
    await refresh()
    if (problems.length > 0) throw new Error(problems.join(' · '))
    setPending(null)
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
            <p style={{ ...styles.secondarySmall, fontSize: 14, lineHeight: '22px', margin: '0 0 12px' }}>
              {t('dialog.intro')}
              {backupDir !== null && backupDir !== '' ? (
                <>
                  <br />
                  {t('dialog.backupDir', { path: backupDir })}
                </>
              ) : null}
              <br />
              {t('dialog.uninstallHint')}
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
                        disabled={loading || !item.backendSupported}
                        onClick={() => { confirmBackup(item) }}
                      >
                        {t('action.backup')}
                      </button>
                      <button
                        type="button"
                        className="dsh-archive-btn dsh-archive-btn-danger"
                        disabled={loading || !item.backendSupported}
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
            {backupsOpen ? (
              <>
                {loading ? loadingRow : null}
                {!loading && backups.length > 0 ? (
                  <div style={{ ...styles.actions, padding: '4px 0 8px' }}>
                    <button
                      type="button"
                      className="dsh-archive-btn"
                      disabled={loading || restorableCount === 0}
                      onClick={() => { confirmRestoreAll() }}
                    >
                      {t('action.restoreAll', { count: restorableCount })}
                    </button>
                    <button
                      type="button"
                      className="dsh-archive-btn dsh-archive-btn-danger"
                      disabled={loading || backups.length === 0}
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
                        disabled={loading || item.legacy}
                        title={item.legacy ? t('legacy.restoreTitle') : undefined}
                        onClick={() => {
                          void (async () => {
                            try {
                              await restoreBackup(item.backupId)
                              await refresh()
                            } catch (reason) {
                              setError(reason instanceof Error ? reason.message : String(reason))
                            }
                          })()
                        }}
                      >
                        {t('action.restore')}
                      </button>
                      <button
                        type="button"
                        className="dsh-archive-btn dsh-archive-btn-danger"
                        disabled={loading}
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
      {pending !== null ? (
        <ArchiveConfirm
          pending={pending}
          t={t}
          onCancel={() => { setPending(null) }}
          onSubmit={submitConfirm}
        />
      ) : null}
    </>
  )
}
