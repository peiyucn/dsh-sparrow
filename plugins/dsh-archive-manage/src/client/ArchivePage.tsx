/**
 * 归档会话管理**页面**：注册进官方 `main` keyed 槽，渲染在**中央列**（对话区那块位置）。
 *
 * ⚠️ 本视图**不是弹窗**：没有遮罩 / `role='dialog'` / `aria-modal` / 焦点陷阱 / 关闭按钮 ——
 * 离开走官方那条（点左栏会话项 / New Session）；二次确认仍走**官方 `Modal` 原语**。
 *
 * 本文件只留状态、数据加载、事件与编排；行渲染在 rows.tsx，确认框在 ConfirmModal.tsx。
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  ARCHIVE_PAGE_SIZE, COPIED_FEEDBACK_MS, SESSIONS_CHANGED_DEBOUNCE_MS, SESSIONS_CHANGED_EVENT,
} from '../constants.js'
import type {
  ArchiveResponse, DeleteMutationResponse, RestoreResponse, StraySessionItem, TrashDeleteAllResponse,
  TrashDeleteResponse, TrashEntry, TrashMutationResponse, TrashRestoreAllResponse, UnarchiveResponse,
} from '../contract.js'
import {
  dropArchivedIds, isCollapsed, subtreeIdsOf, subtreeLive, trashSubagentTree, type ArchivedSessionItem,
} from './archivedTree.js'
import { ConfirmModal, type PendingConfirm } from './ConfirmModal.js'
import { renderArchivedRow, renderStrayRow, renderTrashRow } from './rows.js'
import { countVisibleRows, trashSubagentsOf, trashVisibleRows } from './window.js'
import { pageStyles } from './styles.js'

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

/**
 * 主面板页面：中央列列出归档会话与回收站，进入时先显示加载态。
 * @param props - 主面板 owner share + 注入动作 + locale 座位。
 */
export function ArchivePanel(props: ArchivePanelProps) {
  const { listArchived, listStrays, listTrashItems, trashDirPath, moveToTrash, unarchiveSession, archiveSession, deleteSession, restoreTrashItem, deleteTrashItem, restoreAllTrash, deleteAllTrash, t } = props
  // 初值即 loading：本页挂载即打开，初值 false 会先画一帧空列表再换成转圈（闪动）。
  const [loading, setLoading] = useState(true)
  const [archived, setArchived] = useState<ArchivedSessionItem[]>([])
  const [strays, setStrays] = useState<StraySessionItem[]>([])
  const [trashItems, setTrashItems] = useState<TrashEntry[]>([])
  const [trashDir, setTrashDir] = useState<{ path: string; displayPath: string } | null>(null)
  const [archivedOpen, setArchivedOpen] = useState(true)
  const [straysOpen, setStraysOpen] = useState(true)
  const [trashOpen, setTrashOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const [copied, setCopied] = useState(false)
  /** 单会话还原锁：连点会并发还原同一 trashId（2026-08-30 审计）。 */
  const [restoringId, setRestoringId] = useState<string | null>(null)
  /** 游离/孤儿会话归档进行中锁。 */
  const [archivingId, setArchivingId] = useState<string | null>(null)
  /** 显式展开过的节点（默认收起由空集表达，不靠初值预置）；回收站键 = trashId，两区互不干扰。 */
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set())
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
    // 只有首屏占满内容区；已有数据时静默刷新，避免整块卸载再挂载的「闪一下」。
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

  /** 游离/孤儿会话归档：父+子树一并归档（可逆操作，无二次确认）。 */
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

  const restoreTrash = (item: TrashEntry): void => {
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
  }

  /** 展开/收起某节点；集合里存的是「显式展开过」的 id。 */
  const toggleId = (set: (update: (prev: ReadonlySet<string>) => ReadonlySet<string>) => void) => (id: string): void => {
    set(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleExpanded = toggleId(setExpandedIds)
  const toggleTrashExpanded = toggleId(setExpandedTrashIds)

  const restorableCount = trashItems.filter(item => !item.legacy).length
  const legacyCount = trashItems.length - restorableCount

  /** 回收站区父子层级：sidecar 的扁平清单 → 嵌套树，一次构建供全部行复用。 */
  const trashTrees = useMemo(
    () => new Map(trashItems.map(item => [item.trashId, trashSubagentTree(trashSubagentsOf(item))])),
    [trashItems],
  )

  // 未释放（本次 dsh 运行中驻留）的会话在归档区内分组前置；父级锁定看整棵子树。
  const liveItems = archived.filter(item => subtreeLive(item))
  const coldItems = archived.filter(item => !subtreeLive(item))

  /**
   * 确认框提交：动作全程在框内展示处理中，成功后由这里关闭；失败 reject 回框内展示。
   * 单条分支成功后按响应里的 id **本地摘行**再关框（refresh 退到后台对账）——host 的 header
   * 缓存已被写穿，紧随其后的刷新要走冷扫描，干等它会让条目与确认框一起卡住。
   * 失败路径语义不变：变更 reject 时本地状态一律不动。
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

  // 分页预算：每次渲染新建（与旧的可变计数器同语义）；总数只用于「加载更多」显隐。
  // 默认可视行只剩父行，窗口预算不再被未展开的子行吃掉。
  const archivedBudget = { remaining: archivedLimit }
  const trashBudget = { remaining: trashLimit }
  const archivedTotal = countVisibleRows(liveItems, item => item.children, item => isCollapsed(expandedIds, item.sessionId))
    + countVisibleRows(coldItems, item => item.children, item => isCollapsed(expandedIds, item.sessionId))
  const trashTotal = trashVisibleRows(trashItems, item => isCollapsed(expandedTrashIds, item.trashId))

  // 行渲染上下文：确认类回调统一走 setPending，动作语义与各按钮的 disabled 条件在 rows.tsx 内。
  const requestConfirm = (next: PendingConfirm): void => { setPending(next) }
  const archivedRowsCtx = {
    t, loading, expandedIds, onToggle: toggleExpanded,
    onUnarchive: (item: ArchivedSessionItem) => { requestConfirm({ kind: 'unarchive', item }) },
    onTrash: (item: ArchivedSessionItem) => { requestConfirm({ kind: 'trash', item }) },
    onDelete: (item: ArchivedSessionItem) => { requestConfirm({ kind: 'delete', item }) },
  }
  const strayRowsCtx = {
    t, loading, archivingId,
    onArchive: (item: StraySessionItem) => { void archiveStray(item) },
    onTrash: (item: StraySessionItem) => { requestConfirm({ kind: 'trashStray', item }) },
    onDelete: (item: StraySessionItem) => { requestConfirm({ kind: 'deleteStray', item }) },
  }
  const trashRowsCtx = {
    t, loading, restoringId, expandedTrashIds,
    childrenOf: (item: TrashEntry) => trashTrees.get(item.trashId) ?? [],
    onToggle: toggleTrashExpanded,
    onRestore: restoreTrash,
    onDelete: (item: TrashEntry) => { requestConfirm({ kind: 'deleteTrashItem', item }) },
  }

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
            <p role="alert" style={pageStyles.errorText}>
              {error}
              {' '}
              <button type="button" className="dsh-archive-btn" onClick={() => { void refresh() }}>{t('retry')}</button>
            </p>
          ) : null}

          <div className="dsh-archive-section-card">
            <button type="button" className="dsh-archive-section" aria-expanded={archivedOpen} onClick={() => { setArchivedOpen(value => !value) }}>
              <span aria-hidden>{archivedOpen ? '▾' : '▸'}</span>
              <span>{t('section.archived', { count: archived.length })}</span>
            </button>
            {archivedOpen ? (
              <>
                {archived.length === 0 ? <p style={pageStyles.secondarySmall}>{t('empty.archived')}</p> : null}
                {liveItems.length > 0 ? (
                  <>
                    <p style={pageStyles.groupHeading}>{t('group.unreleased', { count: liveItems.length })}</p>
                    {liveItems.map(item => renderArchivedRow(archivedRowsCtx, item, archivedBudget))}
                  </>
                ) : null}
                {coldItems.map(item => renderArchivedRow(archivedRowsCtx, item, archivedBudget))}
                {archivedTotal > archivedLimit ? (
                  <button type="button" className="dsh-archive-btn" style={pageStyles.loadMore} onClick={() => { setArchivedLimit(limit => limit + ARCHIVE_PAGE_SIZE) }}>
                    {t('pager.loadMore', { remaining: archivedTotal - archivedLimit })}
                  </button>
                ) : null}
              </>
            ) : null}
          </div>

          {strays.length > 0 ? (
            <div className="dsh-archive-section-card">
              <button type="button" className="dsh-archive-section" aria-expanded={straysOpen} onClick={() => { setStraysOpen(value => !value) }}>
                <span aria-hidden>{straysOpen ? '▾' : '▸'}</span>
                <span>{t('section.strays', { count: strays.length })}</span>
              </button>
              {straysOpen ? (
                <>
                  <p style={pageStyles.secondarySmall}>{t('stray.hint')}</p>
                  {strays.slice(0, straysLimit).map(item => renderStrayRow(strayRowsCtx, item))}
                  {strays.length > straysLimit ? (
                    <button type="button" className="dsh-archive-btn" style={pageStyles.loadMore} onClick={() => { setStraysLimit(limit => limit + ARCHIVE_PAGE_SIZE) }}>
                      {t('pager.loadMore', { remaining: strays.length - straysLimit })}
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}

          <div className="dsh-archive-section-card">
            <button type="button" className="dsh-archive-section" aria-expanded={trashOpen} onClick={() => { setTrashOpen(value => !value) }}>
              <span aria-hidden>{trashOpen ? '▾' : '▸'}</span>
              <span>{t('section.trash', { count: trashItems.length })}</span>
            </button>
            {trashOpen ? (
              <>
                {/* 回收站位置归回收站区（页面顶部不放全局行）；点击复制完整路径。 */}
                {trashDir !== null && trashDir.displayPath !== '' ? (
                  <p style={pageStyles.secondarySmall}>
                    {t('dialog.trashDir')}
                    {' '}
                    <button type="button" className="dsh-archive-trash-dir" title={`${trashDir.path}（${t('dialog.copyHint')}）`} onClick={() => { void copyTrashDir() }}>
                      {trashDir.displayPath}
                      {copied ? ` ✓${t('dialog.copied')}` : ''}
                    </button>
                  </p>
                ) : null}
                <p style={pageStyles.secondarySmall}>{t('trash.hint')}</p>
                {trashItems.length > 0 ? (
                  <div style={pageStyles.trashBulkActions}>
                    <button type="button" className="dsh-archive-btn" disabled={loading || restorableCount === 0 || restoringId !== null} onClick={() => { setPending({ kind: 'restoreAll', restorable: restorableCount, legacy: legacyCount }) }}>
                      {t('action.restoreAll', { count: restorableCount })}
                    </button>
                    <button type="button" className="dsh-archive-btn dsh-archive-btn-danger" disabled={loading || trashItems.length === 0 || restoringId !== null} onClick={() => { setPending({ kind: 'deleteAll', count: trashItems.length }) }}>
                      {t('action.deleteAll')}
                    </button>
                  </div>
                ) : null}
                {trashItems.length > 0 ? (
                  <p role="note" style={pageStyles.trashUninstallHint}>{t('trash.uninstallHint')}</p>
                ) : null}
                {trashItems.length === 0 ? <p style={pageStyles.secondarySmall}>{t('empty.trash')}</p> : null}
                {trashItems.some(item => item.legacy) ? <p style={pageStyles.secondarySmall}>{t('legacy.hint')}</p> : null}
                {trashItems.map(item => renderTrashRow(trashRowsCtx, item, trashBudget))}
                {trashTotal > trashLimit ? (
                  <button type="button" className="dsh-archive-btn" style={pageStyles.loadMore} onClick={() => { setTrashLimit(limit => limit + ARCHIVE_PAGE_SIZE) }}>
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
        <ConfirmModal pending={pending} t={t} onCancel={() => { setPending(null) }} onSubmit={submitConfirm} />
      ) : null}
    </section>
  )
}
