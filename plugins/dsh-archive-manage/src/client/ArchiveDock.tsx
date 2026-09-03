/** 归档会话管理入口：sidebar footer action + 弹窗（zh/en 双语 + loading 态）。 */

import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { IconArchiveOutline20, IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'

/** 归档树节点：顶层为归档会话根，children 为随父归档的子会话（spec 08，只操作父）。 */
export interface ArchivedSessionItem {
  readonly sessionId: string
  readonly title: string
  readonly updatedAt: number
  readonly createdAt: number
  readonly live: boolean
  readonly running: boolean
  readonly backendSupported: boolean
  readonly workspaceIds: readonly string[]
  /** 父会话已不存在的孤儿子会话（按顶层对待，可手动归档/删除）。 */
  readonly orphan: boolean
  readonly children: readonly ArchivedSessionItem[]
  /** 展示用事实（官方投影/快照；缺失时隐藏对应项）。 */
  readonly project?: string
  readonly turns?: number
  readonly tokens?: number
  readonly lastActiveAt?: number
  readonly sizeBytes?: number
}

export interface TrashItem {
  readonly trashId: string
  readonly sessionId: string
  readonly title: string
  readonly archivedAt: string
  readonly legacy: boolean
}

export interface StraySessionItem {
  readonly sessionId: string
  readonly title: string
  readonly createdAt: number
  readonly blank: boolean
  /** 父会话已不存在的孤儿子会话（spec 08：按顶层对待）。 */
  readonly orphan: boolean
  readonly live: boolean
  readonly running: boolean
  readonly backendSupported: boolean
  readonly project?: string
  readonly turns?: number
  readonly tokens?: number
  readonly lastActiveAt?: number
  readonly sizeBytes?: number
}

export interface ArchiveDockInjected {
  listArchived: () => Promise<ArchivedSessionItem[]>
  listStrays: () => Promise<StraySessionItem[]>
  listTrashItems: () => Promise<TrashItem[]>
  /** 回收站实际存放目录（绝对路径 + 掩码后的展示路径），面板提示信息里明示卸载影响。 */
  trashDirPath: () => Promise<{ path: string; displayPath: string }>
  moveToTrash: (sessionId: string) => Promise<unknown>
  unarchiveSession: (sessionId: string) => Promise<unknown>
  archiveSession: (sessionId: string) => Promise<unknown>
  deleteSession: (sessionId: string, confirmTitle: string, simple: boolean) => Promise<unknown>
  restoreTrashItem: (trashId: string) => Promise<unknown>
  deleteTrashItem: (trashId: string) => Promise<unknown>
  restoreAllTrash: () => Promise<{ restored?: string[]; skippedLegacy?: number; failed?: Array<{ trashId: string; message: string }> }>
  deleteAllTrash: () => Promise<{ deleted?: number; failed?: string[] }>
}

export type ArchiveDockProps = PropsRuntime<'sidebar.footer.action'> & ArchiveDockInjected & { t: TranslateNS<'archive-manage'> }

/** 注入侧边栏 footer 触发键样式（对齐官方 settings 触发键：透明底、圆角、悬停亮底、rail 圆形）。 */
export function ensureArchiveStyles(): void {
  if (document.querySelector('style[data-dsh-archive-trigger]') !== null) return
  const style = document.createElement('style')
  style.dataset.dshArchiveTrigger = ''
  style.textContent = `
/* spec 08 归档树：父行折叠按钮 + 树状连接线。 */
.dsh-archive-tree-toggle {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 12px;
  line-height: 1;
}
.dsh-archive-tree-toggle:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.dsh-archive-tree-toggle-spacer {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 12px;
  line-height: 1;
  user-select: none;
}
/* 分组线：父会话与其全部子会话视为一个整体块，分割线画在整块底部（父行自身不再画线）。
   组内用 L 形连接线：竖线 = 子区容器 border-left（落点 = 父行折叠按钮中心 10px），
   每个子节点一根 14px 横连钉在标题行中线（子行 padding-top 4px + 行高 22px → 15px），
   末子节点用 ::after 盖掉竖线过肘残段（面板底色实色，覆盖安全）。 */
.dsh-archive-tree-children {
  margin-left: 10px;
  padding-left: 14px;
  border-left: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
}
.dsh-archive-tree-group {
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
}
.dsh-archive-tree-node {
  position: relative;
}
.dsh-archive-tree-node::before {
  content: '';
  position: absolute;
  left: -14px;
  top: 15px;
  width: 14px;
  height: 0;
  border-top: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
}
.dsh-archive-tree-node-last::after {
  content: '';
  position: absolute;
  left: -15px;
  top: 16px;
  bottom: 0;
  width: 2px;
  background: var(--dsw-alias-bg-layer-2, #f6f7f9);
}
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
  corner-shape: round;
}
.dsh-archive-btn {
  /* 官方 Button.sm 同款几何：h28 + r14 胶囊（超椭圆角随官方全局规则自动生效）。 */
  height: 28px;
  padding: 0 10px;
  border: 0.5px solid var(--dsw-alias-border-l3, #d4d8e0);
  border-radius: 14px;
  outline: none;
  background: transparent;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 12px;
  line-height: 18px;
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
  border-radius: 8px;
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
/* 区块卡：官方 settings 内容卡同款 token（ModelsSection .rowCard：border-l2 + r12），
   归档区 / 回收站各包一块，视觉上分割两组列表；应用无全局 border-box，须显式声明。 */
.dsh-archive-section-card {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  margin: 0 0 12px;
  padding: 8px 12px 12px;
  border: 0.5px solid var(--dsw-alias-border-l4, #e2e5ea);
  border-radius: 16px;
}
/* 分组头横贯卡内两侧、文字与行内容左对齐（卡内边距 12px）。 */
.dsh-archive-section-card .dsh-archive-section {
  width: calc(100% + 24px);
  margin: 0 -12px 4px -12px;
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
  box-shadow: var(--dsw-elevation-prominent, 0 12px 40px rgba(0,0,0,0.22));
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
/* 回收站路径按钮：掩码展示，点击复制完整路径（悬停 title 给全文）。 */
.dsh-archive-trash-dir {
  display: inline;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--dsw-alias-button-info-fill, #4d6bfe);
  font-family: inherit;
  font-size: 14px;
  line-height: 22px;
  cursor: pointer;
  word-break: break-all;
}
.dsh-archive-trash-dir:hover {
  text-decoration: underline;
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
/* 面板滚动区：elevated surface 重绑 l2 滚动条 token（base 默认 l1，浮层上对比度不对）。 */
.dsh-archive-panel-body {
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
}
/* 整页 loading：四个初始请求（归档/游离/回收站/回收站目录）都落定前占满内容区，
   避免「打开后加载闪动」（2026-09-01）。 */
.dsh-archive-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 240px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 14px;
  line-height: 22px;
}
.dsh-archive-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--dsw-alias-border-l1, #d4d8e0);
  border-top-color: var(--dsw-alias-button-info-fill, #4d6bfe);
  border-radius: 50%;
  corner-shape: round;
  animation: dsh-archive-spin 0.8s linear infinite;
}
@keyframes dsh-archive-spin {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .dsh-archive-spinner { animation: none; }
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
    boxShadow: 'var(--dsw-elevation-prominent, 0 12px 40px rgba(0,0,0,0.22))',
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
  /** 子分组小标题（未释放）：官方面板分组标签同款（12px 次级色）。 */
  groupHeading: {
    margin: '10px 0 2px',
    fontSize: 12,
    lineHeight: '18px',
    fontWeight: 500,
    color: 'var(--dsw-alias-label-secondary, #6b7280)',
  } satisfies CSSProperties,
} as const

/** 待确认动作（web 确认框状态）。 */
type PendingConfirm =
  | { readonly kind: 'unarchive'; readonly item: ArchivedSessionItem }
  | { readonly kind: 'trash'; readonly item: ArchivedSessionItem }
  | { readonly kind: 'delete'; readonly item: ArchivedSessionItem }
  | { readonly kind: 'trashStray'; readonly item: StraySessionItem }
  | { readonly kind: 'deleteStray'; readonly item: StraySessionItem }
  | { readonly kind: 'deleteTrashItem'; readonly item: TrashItem }
  | { readonly kind: 'restoreAll'; readonly restorable: number; readonly legacy: number }
  | { readonly kind: 'deleteAll'; readonly count: number }

interface ArchiveConfirmProps {
  readonly pending: PendingConfirm
  readonly t: TranslateNS<'archive-manage'>
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
  const needsTyping = pending.kind === 'delete' || (pending.kind === 'deleteStray' && !pending.item.blank) || pending.kind === 'deleteAll'
  const phrase = t('confirm.deleteAllPhrase')
  const expected = pending.kind === 'delete' || pending.kind === 'deleteStray' ? pending.item.title.trim() : pending.kind === 'deleteAll' ? phrase : ''
  const title = pending.kind === 'unarchive' ? t('action.unarchive')
    : pending.kind === 'trash' || pending.kind === 'trashStray' ? t('action.trash')
    : pending.kind === 'delete' || pending.kind === 'deleteStray' || pending.kind === 'deleteTrashItem' ? t('action.deletePermanently')
      : pending.kind === 'restoreAll' ? t('action.restoreAll', { count: pending.restorable })
        : t('action.deleteAll')
  const description = pending.kind === 'unarchive' ? t('confirm.unarchive', { name: pending.item.title })
    : pending.kind === 'trash' || pending.kind === 'trashStray' ? t('confirm.trash', { name: pending.item.title })
    : pending.kind === 'delete' ? t('confirm.delete', { name: pending.item.title })
      : pending.kind === 'deleteStray'
        ? (pending.item.blank
          ? t('confirm.deleteStrayBlank', { name: pending.item.title })
          : t('confirm.delete', { name: pending.item.title }))
        : pending.kind === 'deleteTrashItem' ? t('confirm.deleteTrashItem', { name: pending.item.title })
          : pending.kind === 'restoreAll'
            ? (pending.legacy > 0
              ? t('confirm.restoreAll.withLegacy', { count: pending.restorable, legacy: pending.legacy })
              : t('confirm.restoreAll', { count: pending.restorable }))
            : t('confirm.deleteAll', { count: pending.count, phrase })
  const workingText = pending.kind === 'unarchive' ? t('confirm.unarchiving')
    : pending.kind === 'trash' || pending.kind === 'trashStray' ? t('confirm.movingToTrash')
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
              placeholder={pending.kind === 'delete' || pending.kind === 'deleteStray' ? pending.item.title : phrase}
              disabled={working}
              autoFocus
              onChange={(event) => { setTyped(event.currentTarget.value) }}
            />
            {mismatch ? (
              <p className="dsh-archive-confirm-hint" role="alert">
                {pending.kind === 'delete' || pending.kind === 'deleteStray' ? t('confirm.deleteMismatch') : t('confirm.deleteAllMismatch', { phrase })}
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
 * footer action 组件：窄栏显示图标，宽栏显示「归档管理」；弹窗列出轻归档会话与回收站。
 * 打开后先显示加载态，数据就绪后再渲染列表。
 * @param props - slot props + 注入动作。
 */
export function ArchiveDock(props: ArchiveDockProps) {
  const { wide, listArchived, listStrays, listTrashItems, trashDirPath, moveToTrash, unarchiveSession, archiveSession, deleteSession, restoreTrashItem, deleteTrashItem, restoreAllTrash, deleteAllTrash, t } = props
  const [open, setOpen] = useState(false)
  const [archived, setArchived] = useState<ArchivedSessionItem[]>([])
  const [strays, setStrays] = useState<StraySessionItem[]>([])
  const [trashItems, setTrashItems] = useState<TrashItem[]>([])
  const [trashDir, setTrashDir] = useState<{ path: string; displayPath: string } | null>(null)
  const [archivedOpen, setArchivedOpen] = useState(true)
  const [straysOpen, setStraysOpen] = useState(true)
  const [trashOpen, setTrashOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const [copied, setCopied] = useState(false)
  /** 单会话还原进行中锁：连点会并发还原同一 trashId（2026-08-30 审计）。 */
  const [restoringId, setRestoringId] = useState<string | null>(null)
  /** 游离/孤儿会话归档进行中锁（spec 08）。 */
  const [archivingId, setArchivingId] = useState<string | null>(null)
  /** 归档树折叠的父节点 id 集合（spec 08）。 */
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(new Set())
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

  // 刷新代际：快速开/关面板产生并发 refresh 时，只让最新一次的结果落地（陈旧列表竞态）。
  const refreshSeqRef = useRef(0)
  const refresh = async (): Promise<void> => {
    const seq = ++refreshSeqRef.current
    setLoading(true)
    try {
      const [nextArchived, nextStrays, nextTrashItems, nextTrashDir] = await Promise.all([
        listArchived(),
        listStrays(),
        listTrashItems(),
        trashDirPath().catch(() => null),
      ])
      if (seq !== refreshSeqRef.current) return
      setArchived(nextArchived)
      setStrays(nextStrays)
      setTrashItems(nextTrashItems)
      setTrashDir(nextTrashDir)
      setError(null)
    } catch (reason) {
      if (seq !== refreshSeqRef.current) return
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (seq === refreshSeqRef.current) setLoading(false)
    }
  }

  // 复制完整回收站路径到剪贴板；成功给 2 秒「已复制」反馈。
  const copiedTimerRef = useRef<number | null>(null)
  const copyTrashDir = async (): Promise<void> => {
    if (trashDir === null) return
    try {
      await navigator.clipboard.writeText(trashDir.path)
      setCopied(true)
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current)
      copiedTimerRef.current = window.setTimeout(() => { setCopied(false) }, 2_000)
    } catch {
      // 剪贴板不可用（非安全上下文等）：悬停 title 里始终有完整路径。
    }
  }
  useEffect(() => () => {
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current)
  }, [])

  useEffect(() => {
    if (!open) return
    void refresh()
  }, [open])

  // 官方会话释放（fiber 销毁）→ 面板打开时实时刷新，hold 标记即时清除（spec 08 §2.5）。
  useEffect(() => {
    if (!open) return
    const onSessionsChanged = (): void => { void refresh() }
    window.addEventListener('dsh-archive-sessions-changed', onSessionsChanged)
    return () => { window.removeEventListener('dsh-archive-sessions-changed', onSessionsChanged) }
  }, [open])

  const confirmTrash = (item: ArchivedSessionItem): void => {
    setPending({ kind: 'trash', item })
  }

  const confirmUnarchive = (item: ArchivedSessionItem): void => {
    setPending({ kind: 'unarchive', item })
  }

  const confirmDelete = (item: ArchivedSessionItem): void => {
    setPending({ kind: 'delete', item })
  }

  const confirmTrashStray = (item: StraySessionItem): void => {
    setPending({ kind: 'trashStray', item })
  }

  const confirmDeleteStray = (item: StraySessionItem): void => {
    setPending({ kind: 'deleteStray', item })
  }

  /** 游离/孤儿会话归档：父+子树一并归档（可逆操作，无二次确认；spec 08）。 */
  const archiveStray = async (item: StraySessionItem): Promise<void> => {
    if (loading || archivingId !== null) return
    setArchivingId(item.sessionId)
    try {
      await archiveSession(item.sessionId)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setArchivingId(null)
    }
  }

  /** 创建龄文案：今天 / N 天前。 */
  const strayAge = (createdAt: number | undefined): string => {
    if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return ''
    const days = Math.floor((Date.now() - createdAt) / 86_400_000)
    return days <= 0 ? t('stray.ageToday') : t('stray.ageDays', { n: days })
  }

  /** 输出 token 数人类可读（1.2M / 30.8K / 512）。 */
  const formatTokens = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return String(n)
  }

  /** 文件大小人类可读。 */
  const formatBytes = (n: number): string => {
    if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
    if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
    return `${n} B`
  }

  /** 会话事实行：项目 · 轮数 · tok · 大小 · 时间（缺失项自动跳过）。 */
  const sessionFactLine = (item: { project?: string; turns?: number; tokens?: number; lastActiveAt?: number; sizeBytes?: number; createdAt: number }): string => {
    const parts = [
      item.project,
      item.turns !== undefined ? t('fact.turns', { n: item.turns }) : null,
      item.tokens !== undefined ? `${formatTokens(item.tokens)} tok` : null,
      item.sizeBytes !== undefined ? formatBytes(item.sizeBytes) : null,
      strayAge(item.lastActiveAt ?? item.createdAt),
    ].filter((part): part is string => typeof part === 'string' && part !== '')
    return parts.join(' · ')
  }

  /** 游离会话行：与归档行同构；空白会话带角标、删除走简化确认；孤儿打标；「归档」以父为单位（spec 08）。 */
  const renderStrayRow = (item: StraySessionItem) => {
    const locked = item.live
    const busy = archivingId === item.sessionId
    return (
      <div key={item.sessionId} style={styles.row}>
        <div style={{ minWidth: 0 }}>
          <div style={styles.title} title={item.title}>{item.title}</div>
          <div style={styles.secondarySmall} title={item.sessionId}>
            {sessionFactLine(item)}
            {item.blank ? ` · ${t('stray.blankBadge')}` : ''}
            {item.orphan ? ` · ${t('stray.orphanBadge')}` : ''}
            {item.running ? ` · ${t('state.running')}` : item.live ? (
              <>
                {' · '}
                <span style={{ color: 'var(--dsw-alias-state-warning-primary, #d9822b)' }}>{t('state.unreleased')}</span>
              </>
            ) : ''}
            {item.backendSupported ? '' : ` · ${t('state.backendUnsupported')}`}
          </div>
        </div>
        <div style={styles.actions}>
          <button
            type="button"
            className="dsh-archive-btn"
            disabled={loading || busy}
            onClick={() => { void archiveStray(item) }}
          >
            {busy ? t('confirm.archiving') : t('action.archive')}
          </button>
          <button
            type="button"
            className="dsh-archive-btn"
            disabled={loading || busy || !item.backendSupported || locked}
            title={locked ? t('state.unreleasedActionHint') : undefined}
            onClick={() => { confirmTrashStray(item) }}
          >
            {t('action.trash')}
          </button>
          <button
            type="button"
            className="dsh-archive-btn dsh-archive-btn-danger"
            disabled={loading || busy || !item.backendSupported || locked}
            title={locked ? t('state.unreleasedActionHint') : undefined}
            onClick={() => { confirmDeleteStray(item) }}
          >
            {t('action.deletePermanently')}
          </button>
        </div>
      </div>
    )
  }

  const confirmDeleteTrashItem = (item: TrashItem): void => {
    setPending({ kind: 'deleteTrashItem', item })
  }

  const restorableCount = trashItems.filter(item => !item.legacy).length
  const legacyCount = trashItems.length - restorableCount

  /** 子树内是否存在未释放会话（父级操作锁定依据；host 侧同样整单拒绝，spec 08）。 */
  const subtreeLive = (item: ArchivedSessionItem): boolean => {
    return item.live || item.children.some(child => subtreeLive(child))
  }

  // 未释放（本次 dsh 运行中驻留）的会话在归档区内分组前置；父级锁定看整棵子树。
  const liveItems = archived.filter(item => subtreeLive(item))
  const coldItems = archived.filter(item => !subtreeLive(item))

  /** 展开/收起某父节点的子树（spec 08）。 */
  const toggleCollapsed = (sessionId: string): void => {
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }

  /** 归档树行：父行（深度 0）带操作按钮与折叠切换；子行缩进只读并带树状连接线（spec 08）。 */
  const renderArchivedRow = (item: ArchivedSessionItem, depth = 0): ReactElement => {
    const locked = depth === 0 && subtreeLive(item)
    const hasChildren = item.children.length > 0
    const collapsed = collapsedIds.has(item.sessionId)
    return (
      <div key={item.sessionId} className={hasChildren ? 'dsh-archive-tree-group' : undefined}>
        <div style={{
          ...styles.row,
          ...(depth > 0 || hasChildren ? { borderBottom: 'none', padding: '4px 0' } : {}),
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              {hasChildren ? (
                <button
                  type="button"
                  className="dsh-archive-tree-toggle"
                  aria-expanded={!collapsed}
                  onClick={() => { toggleCollapsed(item.sessionId) }}
                >
                  <span aria-hidden>{collapsed ? '▸' : '▾'}</span>
                </button>
              ) : (
                <span className="dsh-archive-tree-toggle-spacer" aria-hidden>·</span>
              )}
              <div style={{ ...styles.title, minWidth: 0 }} title={item.title}>{item.title}</div>
            </div>
            <div style={{ ...styles.secondarySmall, paddingLeft: 20, marginTop: 2 }} title={item.sessionId}>
              {sessionFactLine(item)}
              {hasChildren ? (
                <>
                  {' · '}
                  <span style={{ color: 'var(--dsw-alias-state-warning-primary, #d9822b)' }}>
                    {t('tree.childCount', { n: item.children.length })}
                  </span>
                </>
              ) : ''}
              {item.orphan ? ` · ${t('stray.orphanBadge')}` : ''}
              {item.running ? ` · ${t('state.running')}` : item.live ? (
                <>
                  {' · '}
                  <span style={{ color: 'var(--dsw-alias-state-warning-primary, #d9822b)' }}>{t('state.unreleased')}</span>
                </>
              ) : ''}
              {item.backendSupported ? '' : ` · ${t('state.backendUnsupported')}`}
            </div>
          </div>
          {depth === 0 ? (
            <div style={styles.actions}>
              <button
                type="button"
                className="dsh-archive-btn"
                disabled={loading}
                onClick={() => { confirmUnarchive(item) }}
              >
                {t('action.unarchive')}
              </button>
              <button
                type="button"
                className="dsh-archive-btn"
                disabled={loading || !item.backendSupported || locked}
                title={locked ? t('state.unreleasedActionHint') : undefined}
                onClick={() => { confirmTrash(item) }}
              >
                {t('action.trash')}
              </button>
              <button
                type="button"
                className="dsh-archive-btn dsh-archive-btn-danger"
                disabled={loading || !item.backendSupported || locked}
                title={locked ? t('state.unreleasedActionHint') : undefined}
                onClick={() => { confirmDelete(item) }}
              >
                {t('action.deletePermanently')}
              </button>
            </div>
          ) : null}
        </div>
        {hasChildren && !collapsed ? (
          <div className="dsh-archive-tree-children">
            {item.children.map((child, index) => (
              <div
                key={child.sessionId}
                className={index === item.children.length - 1
                  ? 'dsh-archive-tree-node dsh-archive-tree-node-last'
                  : 'dsh-archive-tree-node'}
              >
                {renderArchivedRow(child, depth + 1)}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  const confirmRestoreAll = (): void => {
    setPending({ kind: 'restoreAll', restorable: restorableCount, legacy: legacyCount })
  }

  const confirmDeleteAll = (): void => {
    setPending({ kind: 'deleteAll', count: trashItems.length })
  }

  /**
   * 确认框提交：动作全程在弹窗内展示处理中，成功后由这里关闭弹窗；
   * 失败（含批量部分失败）reject 回弹窗展示错误。
   */
  const submitConfirm = async (typed: string): Promise<void> => {
    if (pending === null) return
    const kind = pending.kind
    if (kind === 'unarchive') {
      await unarchiveSession(pending.item.sessionId)
      await refresh()
      setPending(null)
      return
    }
    if (kind === 'trash' || kind === 'trashStray') {
      await moveToTrash(pending.item.sessionId)
      await refresh()
      setPending(null)
      return
    }
    if (kind === 'delete') {
      await deleteSession(pending.item.sessionId, typed, false)
      await refresh()
      setPending(null)
      return
    }
    if (kind === 'deleteStray') {
      await deleteSession(pending.item.sessionId, pending.item.blank ? '' : typed, pending.item.blank)
      await refresh()
      setPending(null)
      return
    }
    if (kind === 'deleteTrashItem') {
      await deleteTrashItem(pending.item.trashId)
      await refresh()
      setPending(null)
      return
    }
    if (kind === 'restoreAll') {
      const result = await restoreAllTrash()
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
    const result = await deleteAllTrash()
    const problems: string[] = []
    const failed = result.failed?.length ?? 0
    if (failed > 0) problems.push(t('notice.failed', { count: failed }))
    await refresh()
    if (problems.length > 0) throw new Error(problems.join(' · '))
    setPending(null)
  }

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
            <div className="dsh-archive-panel-body" style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 24px 24px' }}>
            {loading ? (
              <div className="dsh-archive-loading" role="status">
                <span className="dsh-archive-spinner" aria-hidden />
                <span>{t('loading')}</span>
              </div>
            ) : (
            <>
            <p style={{ ...styles.secondarySmall, fontSize: 14, lineHeight: '22px', margin: '0 0 12px' }}>
              {trashDir !== null && trashDir.displayPath !== '' ? (
                <>
                  {t('dialog.trashDir')}
                  {' '}
                  <button
                    type="button"
                    className="dsh-archive-trash-dir"
                    title={`${trashDir.path}（${t('dialog.copyHint')}）`}
                    onClick={() => { void copyTrashDir() }}
                  >
                    {trashDir.displayPath}
                    {copied ? ` ✓${t('dialog.copied')}` : ''}
                  </button>
                </>
              ) : null}
            </p>
            {error !== null ? (
              <p role="alert" style={{ color: 'var(--dsw-alias-state-error-primary, #c62828)', margin: '0 0 12px' }}>
                {error}
                {' '}
                <button type="button" className="dsh-archive-btn" onClick={() => { void refresh() }}>{t('retry')}</button>
              </p>
            ) : null}

            <div className="dsh-archive-section-card">
              <button
                type="button"
                className="dsh-archive-section"
                aria-expanded={archivedOpen}
                onClick={() => { setArchivedOpen(value => !value) }}
              >
                <span aria-hidden>{archivedOpen ? '▾' : '▸'}</span>
                <span>{t('section.archived', { count: archived.length })}</span>
              </button>
              {archivedOpen ? (
                <>
                  {archived.length === 0 ? <p style={styles.secondarySmall}>{t('empty.archived')}</p> : null}
                  {liveItems.length > 0 ? (
                    <>
                      <p style={styles.groupHeading}>{t('group.unreleased', { count: liveItems.length })}</p>
                      {liveItems.map(item => renderArchivedRow(item))}
                    </>
                  ) : null}
                  {coldItems.map(item => renderArchivedRow(item))}
                </>
              ) : null}
            </div>

            {strays.length > 0 ? (
              <div className="dsh-archive-section-card">
                <button
                  type="button"
                  className="dsh-archive-section"
                  aria-expanded={straysOpen}
                  onClick={() => { setStraysOpen(value => !value) }}
                >
                  <span aria-hidden>{straysOpen ? '▾' : '▸'}</span>
                  <span>{t('section.strays', { count: strays.length })}</span>
                </button>
                {straysOpen ? (
                  <>
                    <p style={styles.secondarySmall}>{t('stray.hint')}</p>
                    {strays.map(renderStrayRow)}
                  </>
                ) : null}
              </div>
            ) : null}

            <div className="dsh-archive-section-card">
              <button
                type="button"
                className="dsh-archive-section"
                aria-expanded={trashOpen}
                onClick={() => { setTrashOpen(value => !value) }}
              >
                <span aria-hidden>{trashOpen ? '▾' : '▸'}</span>
                <span>{t('section.trash', { count: trashItems.length })}</span>
              </button>
              {trashOpen ? (
                <>
                  <p style={styles.secondarySmall}>{t('trash.hint')}</p>
                  {trashItems.length > 0 ? (
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
                        disabled={loading || trashItems.length === 0}
                        onClick={() => { confirmDeleteAll() }}
                      >
                        {t('action.deleteAll')}
                      </button>
                    </div>
                  ) : null}
                  {trashItems.length > 0 ? (
                    <p role="note" style={{ color: 'var(--dsw-alias-state-warning-primary, #d9822b)', fontSize: 12, lineHeight: '18px', margin: '0 0 4px' }}>
                      {t('trash.uninstallHint')}
                    </p>
                  ) : null}
                  {trashItems.length === 0 ? <p style={styles.secondarySmall}>{t('empty.trash')}</p> : null}
                  {trashItems.some(item => item.legacy) ? (
                    <p style={styles.secondarySmall}>
                      {t('legacy.hint')}
                    </p>
                  ) : null}
                  {trashItems.map(item => (
                    <div key={item.trashId} style={styles.row}>
                      <div style={{ minWidth: 0 }}>
                        <div style={styles.title} title={item.title}>{item.title}</div>
                        <div style={styles.secondarySmall} title={item.sessionId}>
                          {item.legacy ? `${t('legacy.badge')} · ` : ''}{item.archivedAt}
                        </div>
                      </div>
                      <div style={styles.actions}>
                        <button
                          type="button"
                          className="dsh-archive-btn"
                          disabled={loading || item.legacy || restoringId !== null}
                          title={item.legacy ? t('legacy.restoreTitle') : undefined}
                          onClick={() => {
                            if (restoringId !== null) return
                            setRestoringId(item.trashId)
                            void (async () => {
                              try {
                                await restoreTrashItem(item.trashId)
                                await refresh()
                              } catch (reason) {
                                setError(reason instanceof Error ? reason.message : String(reason))
                              } finally {
                                setRestoringId(null)
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
                          onClick={() => { confirmDeleteTrashItem(item) }}
                        >
                          {t('action.deletePermanently')}
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              ) : null}
            </div>
            </>
            )}
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