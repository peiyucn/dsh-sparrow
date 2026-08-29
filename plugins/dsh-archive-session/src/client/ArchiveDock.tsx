/** 归档会话管理入口：sidebar footer action + 弹窗。 */

import { useEffect, useState, type CSSProperties } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

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
  backupSession: (sessionId: string) => Promise<void>
  deleteSession: (sessionId: string, confirmTitle: string) => Promise<void>
  restoreBackup: (backupId: string) => Promise<void>
  deleteBackup: (backupId: string) => Promise<void>
}

export type ArchiveDockProps = PropsRuntime<'sidebar.footer.action'> & ArchiveDockInjected

const styles = {
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 8px',
    border: '1px solid var(--dsw-alias-border-l1, #d4d8e0)',
    borderRadius: 6,
    background: 'var(--dsw-alias-bg-layer-1, #ffffff)',
    color: 'var(--dsw-alias-label-primary, #1f2329)',
    cursor: 'pointer',
  } satisfies CSSProperties,
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.28)',
  } satisfies CSSProperties,
  panel: {
    width: 'min(720px, calc(100vw - 32px))',
    maxHeight: '80vh',
    overflow: 'auto',
    padding: 16,
    borderRadius: 12,
    background: 'var(--dsw-alias-bg-layer-2, #f6f7f9)',
    color: 'var(--dsw-alias-label-primary, #1f2329)',
    boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
  } satisfies CSSProperties,
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    alignItems: 'center',
    padding: '8px 4px',
    borderBottom: '1px solid var(--dsw-alias-border-l1, #e2e5ea)',
  } satisfies CSSProperties,
  actions: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  } satisfies CSSProperties,
  small: {
    border: '1px solid var(--dsw-alias-border-l1, #d4d8e0)',
    borderRadius: 5,
    background: 'transparent',
    color: 'inherit',
    padding: '3px 8px',
    cursor: 'pointer',
  } satisfies CSSProperties,
  danger: {
    color: 'var(--dsw-alias-state-error-primary, #c62828)',
  } satisfies CSSProperties,
  title: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } satisfies CSSProperties,
} as const

/**
 * footer action 组件：窄栏显示图标，宽栏显示「归档」；弹窗列出轻归档会话与备份。
 * @param props - slot props + 注入动作。
 */
export function ArchiveDock(props: ArchiveDockProps) {
  const { wide, listArchived, listBackups, backupSession, deleteSession, restoreBackup, deleteBackup } = props
  const [open, setOpen] = useState(false)
  const [archived, setArchived] = useState<ArchivedSessionItem[]>([])
  const [backups, setBackups] = useState<BackupItem[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = async (): Promise<void> => {
    try {
      const [nextArchived, nextBackups] = await Promise.all([listArchived(), listBackups()])
      setArchived(nextArchived)
      setBackups(nextBackups)
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  useEffect(() => {
    if (!open) return
    void refresh()
  }, [open])

  const run = async (key: string, action: () => Promise<void>): Promise<void> => {
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
    const ok = window.confirm(`备份会话「${item.title}」？\n\n备份后 @ / 侧边栏不再出现；可随时从备份区恢复。`)
    if (!ok) return
    void run(`backup:${item.sessionId}`, () => backupSession(item.sessionId))
  }

  const confirmDelete = (item: ArchivedSessionItem): void => {
    const typed = window.prompt(`此操作不可逆！\n\n请输入完整会话标题「${item.title}」以确认删除：`)
    if (typed === null) return
    if (typed.trim() !== item.title.trim()) {
      setError('删除确认失败：输入的标题不一致')
      return
    }
    void run(`delete:${item.sessionId}`, () => deleteSession(item.sessionId, typed))
  }

  const confirmDeleteBackup = (item: BackupItem): void => {
    const ok = window.confirm(`删除备份「${item.title}」？\n\n此操作不可逆，备份内容将被移除。`)
    if (!ok) return
    void run(`backupDelete:${item.backupId}`, () => deleteBackup(item.backupId))
  }

  return (
    <>
      <button
        type="button"
        style={styles.button}
        title="归档会话管理"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setOpen(value => !value) }}
      >
        <span aria-hidden>📦</span>
        {wide ? <span>归档</span> : null}
      </button>

      {open ? (
        <div style={styles.overlay} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false)
        }}>
          <div style={styles.panel} role="dialog" aria-modal="true" aria-label="归档会话管理">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>归档会话管理</h2>
              <button type="button" style={styles.small} aria-label="关闭" onClick={() => { setOpen(false) }}>关闭</button>
            </div>

            <p style={{ color: 'var(--dsw-alias-label-secondary, #6b7280)', fontSize: 13 }}>
              轻量标题已默认启用；备份可逆，删除不可逆。
            </p>
            {error !== null ? <p role="alert" style={{ color: 'var(--dsw-alias-state-error-primary, #c62828)' }}>{error}</p> : null}

            <h3 style={{ fontSize: 15 }}>已轻归档（{archived.length}）</h3>
            {archived.length === 0 ? <p style={{ color: 'var(--dsw-alias-label-secondary, #6b7280)' }}>暂无轻归档会话</p> : null}
            {archived.map(item => (
              <div key={item.sessionId} style={styles.row}>
                <div style={{ minWidth: 0 }}>
                  <div style={styles.title} title={item.title}>{item.title}</div>
                  <div style={{ color: 'var(--dsw-alias-label-secondary, #6b7280)', fontSize: 12 }}>
                    {item.sessionId}
                    {item.running ? ' · 运行中' : item.live ? ' · 已打开' : ''}
                    {item.backendSupported ? '' : ' · 后端不支持文件级操作'}
                  </div>
                </div>
                <div style={styles.actions}>
                  <button
                    type="button"
                    style={styles.small}
                    disabled={busy !== null || !item.backendSupported}
                    onClick={() => { confirmBackup(item) }}
                  >
                    备份
                  </button>
                  <button
                    type="button"
                    style={{ ...styles.small, ...styles.danger }}
                    disabled={busy !== null || !item.backendSupported}
                    onClick={() => { confirmDelete(item) }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}

            <h3 style={{ fontSize: 15 }}>备份区（{backups.length}）</h3>
            {backups.length === 0 ? <p style={{ color: 'var(--dsw-alias-label-secondary, #6b7280)' }}>暂无备份</p> : null}
            {backups.some(item => item.legacy) ? (
              <p style={{ color: 'var(--dsw-alias-label-secondary, #6b7280)', fontSize: 12 }}>
                标「旧格式」的备份来自更早版本，缺少恢复信息，仅可删除。
              </p>
            ) : null}
            {backups.map(item => (
              <div key={item.backupId} style={styles.row}>
                <div style={{ minWidth: 0 }}>
                  <div style={styles.title} title={item.title}>{item.title}</div>
                  <div style={{ color: 'var(--dsw-alias-label-secondary, #6b7280)', fontSize: 12 }}>
                    {item.legacy ? '旧格式 · ' : ''}{item.archivedAt} · {item.sessionId}
                  </div>
                </div>
                <div style={styles.actions}>
                  <button
                    type="button"
                    style={styles.small}
                    disabled={busy !== null || item.legacy}
                    title={item.legacy ? '旧格式备份缺少恢复信息，无法恢复' : undefined}
                    onClick={() => { void run(`restore:${item.backupId}`, () => restoreBackup(item.backupId)) }}
                  >
                    恢复
                  </button>
                  <button
                    type="button"
                    style={{ ...styles.small, ...styles.danger }}
                    disabled={busy !== null}
                    onClick={() => { confirmDeleteBackup(item) }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  )
}
