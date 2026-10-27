/**
 * 归档会话管理**页面**：注册进官方 `main` keyed 槽，渲染在**中央列**
 * （对话区那块位置），与官方「插件」/「自动化任务」同形。
 *
 * ⚠️ 本视图**不再是弹窗**：没有遮罩、没有 `role='dialog'` / `aria-modal`、
 * 没有「点遮罩关闭」、没有焦点陷阱、没有关闭按钮 —— 离开的方式是官方那条
 * （点左栏会话项 / New Session）。二次确认仍走**官方 `Modal` 原语**
 * （与官方 `ui-schedule` / `ui-plugin-manager` 在各自主页面里做删除确认的方式一致）。
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { Modal, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  ARCHIVE_PAGE_SIZE, COPIED_FEEDBACK_MS, DAY_MS, SESSIONS_CHANGED_DEBOUNCE_MS, SESSIONS_CHANGED_EVENT,
} from '../constants.js'
import type {
  ArchiveResponse, DeleteMutationResponse, RestoreResponse, StraySessionItem, TrashDeleteAllResponse,
  TrashDeleteResponse, TrashEntry, TrashMutationResponse, TrashRestoreAllResponse, TrashSubagentItem, UnarchiveResponse,
} from '../contract.js'
import { descendantLive, dropArchivedIds, isCollapsed, subtreeIdsOf, subtreeLive, trashSubagentTree, type ArchivedSessionItem, type TrashSubagentNode } from './archivedTree.js'
import { countVisibleRows } from './paging.js'

/** 页面的注入面（业务动作；响应形状统一取 contract.ts，避免与本文件内联类型漂移）。 */
export interface ArchivePanelInjected {
  listArchived: () => Promise<ArchivedSessionItem[]>
  listStrays: () => Promise<StraySessionItem[]>
  listTrashItems: () => Promise<TrashEntry[]>
  /** 回收站实际存放目录（绝对路径 + 掩码后的展示路径），面板提示信息里明示卸载影响。 */
  trashDirPath: () => Promise<{ path: string; displayPath: string }>
  moveToTrash: (sessionId: string) => Promise<TrashMutationResponse>
  unarchiveSession: (sessionId: string) => Promise<UnarchiveResponse>
  archiveSession: (sessionId: string) => Promise<ArchiveResponse>
  deleteSession: (sessionId: string, confirmTitle: string, simple: boolean) => Promise<DeleteMutationResponse>
  restoreTrashItem: (trashId: string) => Promise<RestoreResponse>
  deleteTrashItem: (trashId: string) => Promise<TrashDeleteResponse>
  restoreAllTrash: () => Promise<TrashRestoreAllResponse>
  deleteAllTrash: () => Promise<TrashDeleteAllResponse>
}

/** 页面组件 props：主面板 owner share + 注入动作 + locale 座位（框架组装）。 */
export type ArchivePanelProps = PropsRuntime<'main'> & InjectFace<ArchivePanelInjected> & PropsLocale<'archive-manage'>

/** 回收站条目的子会话（旧格式条目没有 sidecar，按空处理）。 */
function trashSubagentsOf(item: TrashEntry): readonly TrashSubagentItem[] {
  return item.legacy ? [] : item.subagents
}

const styles = {
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
    /* ⚠️ 字号与行高都要**显式**给：本页已补 14px 基准，但行高若留 `normal`
       行盒只有约 16.8px，比官方同位置（会话行标题 14px/20px）矮一档、
       行间距读起来发挤。官方列表标题的行高是 20px，这里对齐。 */
    fontSize: 14,
    lineHeight: '20px',
  } satisfies CSSProperties,
  secondarySmall: {
    color: 'var(--dsw-alias-label-secondary, #6b7280)',
    fontSize: 12,
    /* ⚠️ 行高也要给：留 `normal` 时行盒只有约 16px，比官方次级文字（12px/18px）
       与云端文件页同款样式都矮 2px，两页并排看会不一致（实测过）。 */
    lineHeight: '18px',
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
  | { readonly kind: 'deleteTrashItem'; readonly item: TrashEntry }
  | { readonly kind: 'restoreAll'; readonly restorable: number; readonly legacy: number }
  | { readonly kind: 'deleteAll'; readonly count: number }

interface ArchiveConfirmProps {
  readonly pending: PendingConfirm
  readonly t: TranslateNS<'archive-manage'>
  readonly onCancel: () => void
  /** 执行动作；成功后父级关闭确认框，失败 reject 并把错误显示在确认框内。 */
  readonly onSubmit: (typed: string) => Promise<void>
}

/**
 * 二次确认框：**官方 `Modal` 原语**提供遮罩、Esc、焦点回收与角色的语义
 * （与官方 ui-schedule / ui-plugin-manager 在主页面里做确认的方式一致）；
 * 提交后在框内展示处理中，成功后自动关闭。
 */
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
    <Modal
      open
      // 处理中不许用遮罩 / Esc / 关闭键把确认框撤掉（请求未落定时状态会孤儿化）。
      onClose={() => { if (!working) onCancel() }}
      title={title}
      closeLabel={t('confirm.cancel')}
      className="dsh-archive-confirm-dialog"
    >
      <p className="dsh-archive-confirm-desc">{description}</p>
      {needsTyping ? (
        <>
          <input
            className="dsh-archive-confirm-input"
            style={{ marginTop: 12 }}
            type="text"
            value={typed}
            placeholder={pending.kind === 'delete' || pending.kind === 'deleteStray' ? pending.item.title : phrase}
            disabled={working}
            data-modal-autofocus
            onChange={(event) => { setTyped(event.currentTarget.value) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && ready) {
                event.stopPropagation()
                submit()
              }
            }}
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
      <div style={{ ...styles.actions, justifyContent: 'flex-end', marginTop: 20 }}>
        <button type="button" className="dsh-archive-btn" disabled={working} onClick={onCancel}>{t('confirm.cancel')}</button>
        <button type="button" className="dsh-archive-btn dsh-archive-btn-danger" disabled={!ready} onClick={submit}>{title}</button>
      </div>
    </Modal>
  )
}

/**
 * 主面板页面：中央列列出归档会话与回收站，进入时先显示加载态。
 * @param props - 主面板 owner share + 注入动作 + locale 座位。
 */
export function ArchivePanel(props: ArchivePanelProps) {
  const { listArchived, listStrays, listTrashItems, trashDirPath, moveToTrash, unarchiveSession, archiveSession, deleteSession, restoreTrashItem, deleteTrashItem, restoreAllTrash, deleteAllTrash, t } = props
  // 初值即 loading：本页**挂载即打开**（无「打开」这一步），若初值是 false，
  // 首帧会先画一次空的归档区 / 回收站再被 effect 换成转圈 —— 那正是要避免的闪动。
  const [loading, setLoading] = useState(true)
  const [archived, setArchived] = useState<ArchivedSessionItem[]>([])
  const [strays, setStrays] = useState<StraySessionItem[]>([])
  const [trashItems, setTrashItems] = useState<TrashEntry[]>([])
  const [trashDir, setTrashDir] = useState<{ path: string; displayPath: string } | null>(null)
  const [archivedOpen, setArchivedOpen] = useState(true)
  const [straysOpen, setStraysOpen] = useState(true)
  const [trashOpen, setTrashOpen] = useState(false)
  /** 已有数据时的后台刷新（写操作后 / 实时刷新事件）：列表保持挂载，只静默更新（防闪烁）。 */
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const [copied, setCopied] = useState(false)
  /** 单会话还原进行中锁：连点会并发还原同一 trashId（2026-08-30 审计）。 */
  const [restoringId, setRestoringId] = useState<string | null>(null)
  /** 游离/孤儿会话归档进行中锁。 */
  const [archivingId, setArchivingId] = useState<string | null>(null)
  /** 归档树里被用户**显式展开**的父节点 id（默认收起——空集即全部收起，
   *  与「跟踪折叠集合」相比默认值由数据结构表达，不靠初值预置）。 */
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set())
  /** 回收站树被显式展开的父条目集合（键 = trashId，与归档树分开：两区互不干扰）。 */
  const [expandedTrashIds, setExpandedTrashIds] = useState<ReadonlySet<string>>(new Set())
  /** 三区分页窗口：数据刷新时复位，加载更多按页递增。 */
  const [archivedLimit, setArchivedLimit] = useState(ARCHIVE_PAGE_SIZE)
  const [straysLimit, setStraysLimit] = useState(ARCHIVE_PAGE_SIZE)
  const [trashLimit, setTrashLimit] = useState(ARCHIVE_PAGE_SIZE)

  // 刷新代际：快速切换面板产生并发 refresh 时，只让最新一次的结果落地（陈旧列表竞态）。
  const refreshSeqRef = useRef(0)
  /** 首屏是否已成功落过数据：决定刷新走「整页 loading」还是「静默更新」。 */
  const loadedRef = useRef(false)
  const refresh = async (): Promise<void> => {
    const seq = ++refreshSeqRef.current
    // 只有首屏（还没有任何数据）才占满内容区。写操作后的刷新改走 refreshing：
    // 此前每次刷新都把 loading 置真 → 内容区被 loading 替换 → 卸载再挂载，看起来就是「闪一下」。
    if (loadedRef.current) setRefreshing(true)
    else setLoading(true)
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
      // 新数据重置分页窗口（避免刷新后停在深层分页位）。
      setArchivedLimit(ARCHIVE_PAGE_SIZE)
      setStraysLimit(ARCHIVE_PAGE_SIZE)
      setTrashLimit(ARCHIVE_PAGE_SIZE)
      loadedRef.current = true
      setError(null)
    } catch (reason) {
      if (seq !== refreshSeqRef.current) return
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (seq === refreshSeqRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
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
      copiedTimerRef.current = window.setTimeout(() => { setCopied(false) }, COPIED_FEEDBACK_MS)
    } catch {
      // 剪贴板不可用（非安全上下文等）：悬停 title 里始终有完整路径。
    }
  }
  useEffect(() => () => {
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current)
  }, [])

  // 挂载即拉数据：本页在中央列按需挂载，离开面板即卸载，重新进入自然重取。
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  useEffect(() => { void refreshRef.current() }, [])

  // 官方会话释放（fiber 销毁）→ 页面在屏时实时刷新，hold 标记即时清除。
  // 300ms 防抖——批量释放会话时合并成一次全量刷新。
  useEffect(() => {
    let timer: number | null = null
    const onSessionsChanged = (): void => {
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => { void refreshRef.current() }, SESSIONS_CHANGED_DEBOUNCE_MS)
    }
    window.addEventListener(SESSIONS_CHANGED_EVENT, onSessionsChanged)
    return () => {
      window.removeEventListener(SESSIONS_CHANGED_EVENT, onSessionsChanged)
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [])

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

  /** 游离/孤儿会话归档：父+子树一并归档（可逆操作，无二次确认；）。 */
  const archiveStray = async (item: StraySessionItem): Promise<void> => {
    if (loading || refreshing || archivingId !== null) return
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
    const days = Math.floor((Date.now() - createdAt) / DAY_MS)
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

  /** 游离会话行：与归档行同构；空白会话带角标、删除走简化确认；孤儿打标；「归档」以父为单位。 */
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
                <span style={{ color: 'var(--dsw-alias-state-warn-primary, #d9822b)' }}>{t('state.unreleased')}</span>
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

  const confirmDeleteTrashItem = (item: TrashEntry): void => {
    setPending({ kind: 'deleteTrashItem', item })
  }

  const restorableCount = trashItems.filter(item => !item.legacy).length
  const legacyCount = trashItems.length - restorableCount

  /** 回收站区父子层级：sidecar 的扁平清单 → 嵌套树，一次构建供全部行复用。 */
  const trashTrees = useMemo(
    () => new Map(trashItems.map(item => [item.trashId, trashSubagentTree(trashSubagentsOf(item))])),
    [trashItems],
  )

  // 未释放（本次 dsh 运行中驻留）的会话在归档区内分组前置；父级锁定看整棵子树
  // （subtreeLive 已下沉到 archivedTree.ts，判定有单测覆盖）。
  const liveItems = archived.filter(item => subtreeLive(item))
  const coldItems = archived.filter(item => !subtreeLive(item))

  /** 展开/收起某父节点的子树（集合里存的是「显式展开过」的 id）。 */
  const toggleExpanded = (sessionId: string): void => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }

  /** 展开/收起回收站父条目的子树（与归档树同一交互语义）。 */
  const toggleTrashExpanded = (trashId: string): void => {
    setExpandedTrashIds(prev => {
      const next = new Set(prev)
      if (next.has(trashId)) next.delete(trashId)
      else next.add(trashId)
      return next
    })
  }

  /** 归档树行：父行（深度 0）带操作按钮与折叠切换；子行缩进只读并带树状连接线。
   *  分页预算：超出窗口的行返回 null，由父层 children 容器跳过空行渲染。 */
  const renderArchivedRow = (item: ArchivedSessionItem, depth = 0): ReactElement | null => {
    if (archivedRowsRendered >= archivedLimit) return null
    archivedRowsRendered += 1
    const locked = depth === 0 && subtreeLive(item)
    const hasChildren = item.children.length > 0
    const collapsed = isCollapsed(expandedIds, item.sessionId)
    const childrenBlock = hasChildren && !collapsed
      ? (() => {
        const emitted: ReactElement[] = []
        for (const child of item.children) {
          if (archivedRowsRendered >= archivedLimit) break
          const row = renderArchivedRow(child, depth + 1)
          if (row === null) continue
          emitted.push(row)
        }
        if (emitted.length === 0) return null
        return (
          <div className="dsh-archive-tree-children">
            {emitted.map((row, index) => (
              <div
                key={row.key}
                className={index === emitted.length - 1
                  ? 'dsh-archive-tree-node dsh-archive-tree-node-last'
                  : 'dsh-archive-tree-node'}
              >
                {row}
              </div>
            ))}
          </div>
        )
      })()
      : null
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
                  onClick={() => { toggleExpanded(item.sessionId) }}
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
                  <span style={{ color: 'var(--dsw-alias-state-warn-primary, #d9822b)' }}>
                    {t('tree.childCount', { n: item.children.length })}
                  </span>
                </>
              ) : ''}
              {item.orphan ? ` · ${t('stray.orphanBadge')}` : ''}
              {item.running ? ` · ${t('state.running')}` : item.live ? (
                <>
                  {' · '}
                  <span style={{ color: 'var(--dsw-alias-state-warn-primary, #d9822b)' }}>{t('state.unreleased')}</span>
                </>
              ) : descendantLive(item) ? (
                <>
                  {' · '}
                  <span style={{ color: 'var(--dsw-alias-state-warn-primary, #d9822b)' }}>{t('state.subagentUnreleased')}</span>
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
        {childrenBlock}
      </div>
    )
  }

  /** 回收站子行：任意深度缩进（父行由 sidecar 的 parentSessionId 还原）。
   *  分页预算：超出窗口的行返回 null。 */
  const renderTrashChildRow = (node: TrashSubagentNode): ReactElement | null => {
    if (trashRowsRendered >= trashLimit) return null
    trashRowsRendered += 1
    const nested = node.children.length > 0
      ? (() => {
        const emitted: ReactElement[] = []
        for (const child of node.children) {
          const row = renderTrashChildRow(child)
          if (row === null) continue
          emitted.push(row)
        }
        if (emitted.length === 0) return null
        return (
          <div className="dsh-archive-tree-children">
            {emitted.map((row, index) => (
              <div
                key={row.key}
                className={index === emitted.length - 1
                  ? 'dsh-archive-tree-node dsh-archive-tree-node-last'
                  : 'dsh-archive-tree-node'}
              >
                {row}
              </div>
            ))}
          </div>
        )
      })()
      : null
    return (
      <div key={node.item.sessionId}>
        <div style={{ ...styles.row, borderBottom: 'none', padding: '4px 0' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span className="dsh-archive-tree-toggle-spacer" aria-hidden>·</span>
              <div style={{ ...styles.title, minWidth: 0 }} title={node.item.title}>{node.item.title}</div>
            </div>
            <div style={{ ...styles.secondarySmall, paddingLeft: 20, marginTop: 2 }} title={node.item.sessionId}>{node.item.sessionId}</div>
          </div>
        </div>
        {nested}
      </div>
    )
  }

  /** 回收站树行：父行带恢复/彻底删除与折叠切换，子行缩进只读（任意深度）
   *  （与归档树同款交互；还原/删除整棵走父条目的 sidecar）。
   *  分页预算：超出窗口的行返回 null。 */
  const renderTrashRow = (item: TrashEntry): ReactElement | null => {
    if (trashRowsRendered >= trashLimit) return null
    trashRowsRendered += 1
    const children = trashTrees.get(item.trashId) ?? []
    const hasChildren = children.length > 0
    const collapsed = isCollapsed(expandedTrashIds, item.trashId)
    const childrenBlock = hasChildren && !collapsed
      ? (() => {
        const emitted: ReactElement[] = []
        for (const child of children) {
          const row = renderTrashChildRow(child)
          if (row === null) continue
          emitted.push(row)
        }
        if (emitted.length === 0) return null
        return (
          <div className="dsh-archive-tree-children">
            {emitted.map((row, index) => (
              <div
                key={row.key}
                className={index === emitted.length - 1
                  ? 'dsh-archive-tree-node dsh-archive-tree-node-last'
                  : 'dsh-archive-tree-node'}
              >
                {row}
              </div>
            ))}
          </div>
        )
      })()
      : null
    return (
      <div key={item.trashId} className={hasChildren ? 'dsh-archive-tree-group' : undefined}>
        <div style={{ ...styles.row, ...(hasChildren ? { borderBottom: 'none', padding: '4px 0' } : {}) }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              {hasChildren ? (
                <button
                  type="button"
                  className="dsh-archive-tree-toggle"
                  aria-expanded={!collapsed}
                  onClick={() => { toggleTrashExpanded(item.trashId) }}
                >
                  <span aria-hidden>{collapsed ? '▸' : '▾'}</span>
                </button>
              ) : (
                <span className="dsh-archive-tree-toggle-spacer" aria-hidden>·</span>
              )}
              <div style={{ ...styles.title, minWidth: 0 }} title={item.title}>{item.title}</div>
            </div>
            <div style={styles.secondarySmall} title={item.sessionId}>
              {item.legacy ? `${t('legacy.badge')} · ` : ''}{item.archivedAt}
              {hasChildren ? (
                <>
                  {' · '}
                  <span style={{ color: 'var(--dsw-alias-state-warn-primary, #d9822b)' }}>
                    {t('tree.childCount', { n: children.length })}
                  </span>
                </>
              ) : ''}
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
              disabled={loading || restoringId !== null}
              onClick={() => { confirmDeleteTrashItem(item) }}
            >
              {t('action.deletePermanently')}
            </button>
          </div>
        </div>
        {childrenBlock}
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
   * 确认框提交：动作全程在确认框内展示处理中，成功后由这里关闭；
   * 失败（含批量部分失败）reject 回确认框展示错误。
   *
   * 单条分支不等整页刷新：写操作必然打穿 host 的 header 缓存，紧随其后的刷新要走冷扫描
   * （列表越大越慢），此前条目与确认框都干等它落定。改为变更成功后立即按响应里的 id 本地摘掉
   * 受影响的行并关闭确认框，refresh() 退到后台对账。摘除集合与 host 完全一致——响应里的 subagentIds
   * 就是随父一起搬走/删掉的**全部后代**子会话（任意深度，见 ），由 refresh 落定。
   * 失败路径语义不变：变更 reject 时本地状态一律不动，错误仍回确认框展示。
   */
  const submitConfirm = async (typed: string): Promise<void> => {
    if (pending === null) return
    const kind = pending.kind
    if (kind === 'unarchive') {
      const item = pending.item
      await unarchiveSession(item.sessionId)
      // 子会话由 host 的父子对齐异步移出归档集；本地先按已知子树摘，收敛结果一致。
      const removed = new Set(subtreeIdsOf(item))
      setArchived(prev => dropArchivedIds(prev, removed))
      setPending(null)
      void refresh()
      return
    }
    if (kind === 'trash' || kind === 'trashStray') {
      const sessionId = pending.item.sessionId
      const result = await moveToTrash(sessionId)
      const removed = new Set([sessionId, ...result.subagentIds ?? []])
      setArchived(prev => dropArchivedIds(prev, removed))
      setStrays(prev => prev.filter(stray => !removed.has(stray.sessionId)))
      setPending(null)
      void refresh()
      return
    }
    if (kind === 'delete') {
      const sessionId = pending.item.sessionId
      const result = await deleteSession(sessionId, typed, false)
      const removed = new Set([sessionId, ...result.subagentIds ?? []])
      setArchived(prev => dropArchivedIds(prev, removed))
      setStrays(prev => prev.filter(stray => !removed.has(stray.sessionId)))
      setPending(null)
      void refresh()
      return
    }
    if (kind === 'deleteStray') {
      const item = pending.item
      const result = await deleteSession(item.sessionId, item.blank ? '' : typed, item.blank)
      const removed = new Set([item.sessionId, ...result.subagentIds ?? []])
      setArchived(prev => dropArchivedIds(prev, removed))
      setStrays(prev => prev.filter(stray => !removed.has(stray.sessionId)))
      setPending(null)
      void refresh()
      return
    }
    if (kind === 'deleteTrashItem') {
      const trashId = pending.item.trashId
      const result = await deleteTrashItem(trashId)
      const removedTrashId = result.trashId ?? trashId
      setTrashItems(prev => prev.filter(item => item.trashId !== removedTrashId))
      setPending(null)
      void refresh()
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

  // 分页预算：每次渲染复位（renderArchivedRow/renderTrashRow 超出窗口返回 null）；
  // 总数用于「加载更多」显隐。树结构不变，分页只裁剪渲染窗口。
  // 默认可视行只剩父行，窗口预算不再被未展开的子行吃掉。
  let archivedRowsRendered = 0
  let trashRowsRendered = 0
  const archivedTotal = countVisibleRows(liveItems, item => item.children, item => isCollapsed(expandedIds, item.sessionId))
    + countVisibleRows(coldItems, item => item.children, item => isCollapsed(expandedIds, item.sessionId))
  const trashTotal = trashItems.reduce((total, item) => {
    const children = trashSubagentsOf(item).length
    return total + 1 + (isCollapsed(expandedTrashIds, item.trashId) ? 0 : children)
  }, 0)

  return (
    <section className="dsh-archive-page" aria-busy={refreshing}>
      {/* 标题行自带 28px 顶内边距并打上窗口拖拽标记：内容不再有遮罩，页面顶端就是窗口边缘。 */}
      <header className="dsh-archive-page-head" data-window-drag>
        <h1 className="dsh-archive-page-title">{t('dialog.title')}</h1>
      </header>

      {loading ? (
        <div className="dsh-archive-loading" role="status" aria-label={t('loading')}>
          <StateDot state="ongoing" />
        </div>
      ) : (
        <>
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
                {archivedTotal > archivedLimit ? (
                  <button
                    type="button"
                    className="dsh-archive-btn"
                    style={{ marginTop: 8 }}
                    onClick={() => { setArchivedLimit(limit => limit + ARCHIVE_PAGE_SIZE) }}
                  >
                    {t('pager.loadMore', { remaining: archivedTotal - archivedLimit })}
                  </button>
                ) : null}
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
                  {strays.slice(0, straysLimit).map(renderStrayRow)}
                  {strays.length > straysLimit ? (
                    <button
                      type="button"
                      className="dsh-archive-btn"
                      style={{ marginTop: 8 }}
                      onClick={() => { setStraysLimit(limit => limit + ARCHIVE_PAGE_SIZE) }}
                    >
                      {t('pager.loadMore', { remaining: strays.length - straysLimit })}
                    </button>
                  ) : null}
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
                {/* 回收站位置归回收站区（页面顶部不放全局行）；点击复制完整路径。 */}
                {trashDir !== null && trashDir.displayPath !== '' ? (
                  <p style={styles.secondarySmall}>
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
                  </p>
                ) : null}
                <p style={styles.secondarySmall}>{t('trash.hint')}</p>
                {trashItems.length > 0 ? (
                  <div style={{ ...styles.actions, padding: '4px 0 8px' }}>
                    <button
                      type="button"
                      className="dsh-archive-btn"
                      disabled={loading || restorableCount === 0 || restoringId !== null}
                      onClick={() => { confirmRestoreAll() }}
                    >
                      {t('action.restoreAll', { count: restorableCount })}
                    </button>
                    <button
                      type="button"
                      className="dsh-archive-btn dsh-archive-btn-danger"
                      disabled={loading || trashItems.length === 0 || restoringId !== null}
                      onClick={() => { confirmDeleteAll() }}
                    >
                      {t('action.deleteAll')}
                    </button>
                  </div>
                ) : null}
                {trashItems.length > 0 ? (
                  <p role="note" style={{ color: 'var(--dsw-alias-state-warn-primary, #d9822b)', fontSize: 12, lineHeight: '18px', margin: '0 0 4px' }}>
                    {t('trash.uninstallHint')}
                  </p>
                ) : null}
                {trashItems.length === 0 ? <p style={styles.secondarySmall}>{t('empty.trash')}</p> : null}
                {trashItems.some(item => item.legacy) ? (
                  <p style={styles.secondarySmall}>
                    {t('legacy.hint')}
                  </p>
                ) : null}
                {trashItems.map(renderTrashRow)}
                {trashTotal > trashLimit ? (
                  <button
                    type="button"
                    className="dsh-archive-btn"
                    style={{ marginTop: 8 }}
                    onClick={() => { setTrashLimit(limit => limit + ARCHIVE_PAGE_SIZE) }}
                  >
                    {t('pager.loadMore', { remaining: trashTotal - trashLimit })}
                  </button>
                ) : null}
              </>
            ) : null}
          </div>

          {/* 合集品牌 footer：页面内容收尾。 */}
          <div className="dsh-archive-page-footer">🐦 dsh-sparrow</div>
        </>
      )}

      {pending !== null ? (
        <ArchiveConfirm
          pending={pending}
          t={t}
          onCancel={() => { setPending(null) }}
          onSubmit={submitConfirm}
        />
      ) : null}
    </section>
  )
}
