/**
 * 云端文件**页面**：注册进官方 `main` keyed 槽，渲染在**中央列**（对话区那块位置），
 * 与官方「插件」/「自动化任务」同形；样式与请求分别在 styles.ts / api.ts。
 *
 * ⚠️ 本视图**不再是弹窗**：没有遮罩、没有 `role='dialog'` / `aria-modal`、
 * 没有「点遮罩关闭」、没有焦点陷阱、没有关闭按钮 —— 离开的方式是官方那条
 * （点左栏会话项 / New Session）。删除确认仍走**官方 `Modal` 原语**
 * （与官方 `ui-schedule` / `ui-plugin-manager` 在各自主页面里做确认的方式一致）。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Modal, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { FileRow } from '../files.js'
import type { FileCountSummary } from './api.js'
import { hasLoadMore, renderedRowCount, RENDER_PAGE_SIZE } from './paging.js'
import { formatUsagePercent, storageUsageRatio } from './quota.js'
import { styles } from './styles.js'

/** 「已复制」反馈复位时长（archive 同款）。 */
const COPIED_RESET_MS = 2_000

/** 页面的注入面（业务动作；与旧入口逐项一致，只换了承载的槽位）。 */
export interface CloudFilesPanelInjected {
  listFiles: (after?: string) => Promise<{ rows: FileRow[]; hasMore: boolean; lastId?: string }>
  deleteFile: (id: string) => Promise<void>
  countFiles: () => Promise<FileCountSummary>
}

/** 页面组件 props：主面板 owner share + 注入动作 + locale 座位（框架组装）。 */
export type CloudFilesPanelProps = PropsRuntime<'main'> & InjectFace<CloudFilesPanelInjected> & PropsLocale<'file-manage'>

/**
 * 页面 loading 用**官方自己的** `StateDot`（`ui-primitives`，`state="ongoing"`）。
 *
 * ⚠️ 2026-09-30 改判：这里原来**手搓过**一套 10×10 点阵（8 个 2px 方块追逐 + 自带 keyframes），
 * 注释写着「照搬 ui-primitives StateDot 的 matrix 分支」—— 那是对**更老的官方**对齐：
 * 官方早在 `4937343a5e feat(web): unify the client visual language`（先于 `0.1.7-rc.1`）
 * 就把 ongoing 换成了 **SVG 圆弧 spinner**（`StateDot.module.css`：1.5s 旋转 + dasharray 呼吸，
 * track 25% 不透明，带 `prefers-reduced-motion` 兜底）。我们没跟 ⇒ owner 看到的是
 * 「官方改了、我们没跟进」的那种不一致。
 *
 * 改为直接 import 官方组件：`ui-primitives` 是**平台种子词**（`PLATFORM_MODULES`）里的外部依赖、
 * 宿主提供，且它**本来就是本插件的 devDependency** ⇒ 零依赖改动；以后官方再改动画，
 * 我们自动跟随，不必再抄一遍几何。故本文件不再有任何 loading 的 keyframes / 几何常量。
 */

/** 页面状态：首屏 loading / 错误横幅 / 列表 + 加载更多 / 删除确认（官方 Modal）。 */
export function CloudFilesPanel({ listFiles, deleteFile, countFiles, t }: CloudFilesPanelProps) {
  const [rows, setRows] = useState<readonly FileRow[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [lastId, setLastId] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<FileRow | null>(null)
  const [busyDelete, setBusyDelete] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [summary, setSummary] = useState<FileCountSummary | null>(null)
  /** 总数统计请求尚未落定：与 loading 一起构成首屏 ready 门（整页 loading）。 */
  const [summaryPending, setSummaryPending] = useState(true)
  /** 刷新代际：并发请求（重试 / 面板重进）时，只让最新一次的结果落地（陈旧响应竞态）。 */
  const refreshSeqRef = useRef(0)
  /** 滚动区容器（列表翻页后滚到底部用）。 */
  const bodyRef = useRef<HTMLDivElement | null>(null)
  /** 加载更多成功后待滚底的标记：新行渲染提交后执行一次。 */
  const scrollPendingRef = useRef(false)
  /** 「已复制」反馈 2s 复位（archive 同款）。 */
  const copiedTimerRef = useRef<number | null>(null)
  /** 渲染窗口上限：行数随「加载更多」递增，超出窗口的行不进 DOM（配额 10000 下 DOM 有界）。 */
  const [renderLimit, setRenderLimit] = useState(RENDER_PAGE_SIZE)

  /** 首屏 / 重试共用：列表与总数统计并发拉取，两者都落定才揭开内容（整页 loading 防闪动）。 */
  const reload = useCallback(() => {
    const seq = ++refreshSeqRef.current
    setLoading(true)
    setSummaryPending(true)
    setSummary(null)
    setError(null)
    // 新代际开始：上一代际被丢弃的 loadMore 不再归还 loadingMore，否则「加载更多」会卡死在禁用态。
    setLoadingMore(false)
    // 同理复位删除锁：删除飞行期间换代时，陈旧 delete 的 finally 被代际守卫吞掉，
    // 不复位会把新代际的删除按钮卡死在禁用态；这里由刷新代际统一复位。
    setBusyDelete(false)
    // 换代清掉待滚底标记：陈旧翻页的滚动不得落在新列表上。
    scrollPendingRef.current = false
    // 换代复位渲染窗口：新列表从头渲染首窗，不带旧代际的窗口位。
    setRenderLimit(RENDER_PAGE_SIZE)
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
    // 总数统计为 best-effort：接口失败只隐藏统计行，不影响列表；同样受刷新代际约束。
    void countFiles()
      .then(next => {
        if (seq === refreshSeqRef.current) setSummary(next)
      })
      .catch(() => {})
      .finally(() => {
        if (seq === refreshSeqRef.current) setSummaryPending(false)
      })
  }, [listFiles, countFiles])

  // 挂载即拉数据：本页在中央列按需挂载，离开面板即卸载，重新进入自然重取。
  // ⚠️ 首帧就是 loading：初始 `loading` / `summaryPending` 都是 true，
  // 否则首帧会先画一次空列表（「打开后先闪一下」的同一个坑）。
  const reloadRef = useRef(reload)
  reloadRef.current = reload
  useEffect(() => { reloadRef.current() }, [])

  useEffect(() => () => {
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current)
  }, [])

  const loadMore = useCallback(() => {
    if (loadingMore) return
    // 窗口还没盖满已加载行：只延伸渲染窗口（不发请求）；滚底 = 滚到新窗口末尾。
    if (renderLimit < rows.length) {
      setRenderLimit(limit => limit + RENDER_PAGE_SIZE)
      scrollPendingRef.current = true
      return
    }
    // 窗口已盖满已加载行且服务端还有更多：拉下一页数据并同步延伸窗口。
    // 官方契约 hasMore=true 与 lastId 同现；缺 lastId 时放弃本次点击
    // （不空转请求：after 缺省会重新拉第一页）。
    if (lastId === undefined) return
    // 刷新代际守卫：翻页期间发生重试 / 面板重进（reload 换代）时，陈旧页结果不得混入新列表。
    const seq = refreshSeqRef.current
    setLoadingMore(true)
    // 新行渲染提交后滚到列表底部（滚动发生在 rows/renderLimit 变化的 effect 里，一次性）。
    scrollPendingRef.current = true
    listFiles(lastId)
      .then(page => {
        if (seq !== refreshSeqRef.current) return
        setRows(current => [...current, ...page.rows])
        setHasMore(page.hasMore)
        setLastId(page.lastId)
        setRenderLimit(limit => limit + RENDER_PAGE_SIZE)
      })
      .catch(reason => {
        if (seq !== refreshSeqRef.current) return
        setError(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => {
        if (seq === refreshSeqRef.current) setLoadingMore(false)
      })
  }, [renderLimit, rows.length, lastId, loadingMore, listFiles])

  const copyId = useCallback(async (row: FileRow) => {
    try {
      await navigator.clipboard.writeText(row.id)
      setCopied(row.id)
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current)
      copiedTimerRef.current = window.setTimeout(() => { setCopied(null) }, COPIED_RESET_MS)
    } catch {
      setCopied(null)
      setError(t('copyFailed'))
    }
  }, [t])

  // 加载更多成功 → rows 增长 / 窗口延伸 → 滚到窗口末尾（标记只在 loadMore 发起时置位，一次消费）。
  useEffect(() => {
    if (!scrollPendingRef.current) return
    scrollPendingRef.current = false
    const el = bodyRef.current
    if (el !== null) el.scrollTop = el.scrollHeight
  }, [rows, renderLimit])

  /** 首屏 ready 门：列表 + 总数都落定前展示整页 loading。 */
  const initialLoading = loading || summaryPending

  const quotaRatio = summary === null ? 0 : storageUsageRatio(summary.totalBytes, summary.quotaBytes)
  /** 窗口内可见行数：「已加载 X / 共 N」按渲染窗口显示，不按已拉取的数据行数虚报。 */
  const visibleCount = renderedRowCount(rows.length, renderLimit)

  const submitDelete = useCallback(() => {
    if (confirming === null || busyDelete) return
    const seq = refreshSeqRef.current
    const deleteId = confirming.id
    setBusyDelete(true)
    deleteFile(deleteId)
      .then(() => {
        // 行移除不设代际守卫：删除已落定，文件确已消失，任何代际的列表移除该行都是真实结果。
        setRows(current => current.filter(row => row.id !== deleteId))
        // 只关闭本代际的确认框：删除飞行期间重进面板并点开新确认框时，陈旧回调不得误关新框。
        setConfirming(current => current !== null && current.id === deleteId ? null : current)
        // 删除后刷新总数（best-effort）；面板已换代（离开重进）时陈旧总数不落地。
        void countFiles().then(next => {
          if (seq === refreshSeqRef.current) setSummary(next)
        }).catch(() => {})
      })
      .catch(reason => {
        // 代际守卫闭环：陈旧删除的失败既不得污染新代际的错误横幅，
        // 也不得误关新代际的确认框（同一文件重新确认删除时，旧失败的迟到回调不得打断新尝试）。
        if (seq !== refreshSeqRef.current) return
        setError(reason instanceof Error ? reason.message : String(reason))
        setConfirming(current => current !== null && current.id === deleteId ? null : current)
      })
      .finally(() => {
        // 陈旧代际的 finally 不得复位新代际的删除锁（新删除飞行中被误放行会连点双删）。
        if (seq === refreshSeqRef.current) setBusyDelete(false)
      })
  }, [busyDelete, confirming, deleteFile, countFiles])

  return (
    <section className="dsh-file-manage-page" data-file-manage-panel aria-busy={loading}>
      {/* 标题行自带 28px 顶内边距并打上窗口拖拽标记：内容不再有遮罩，页面顶端就是窗口边缘。 */}
      <header className="dsh-file-manage-page-head" data-window-drag>
        <h1 className="dsh-file-manage-page-title">{t('dialog.title')}</h1>
      </header>

      <div className="dsh-file-manage-summary-slot">
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
              {visibleCount < summary.count
                ? t('summary.loaded', { loaded: visibleCount, count: summary.count })
                : t('summary.count', { count: summary.count })}
            </p>
          </div>
        ) : null}
      </div>

      <div ref={bodyRef} style={styles.body} className="dsh-file-manage-body">
        {initialLoading ? (
          <div className="dsh-file-manage-loading" role="status" aria-label={t('loading')}>
            <StateDot state="ongoing" />
          </div>
        ) : (
          <>
            {error !== null ? (
              <p role="alert" style={{ ...styles.secondarySmall, margin: '0 0 12px', color: 'var(--dsw-alias-state-error-primary, #c62828)' }}>
                {error}
                {' '}
                <button type="button" className="dsh-file-manage-btn" onClick={() => { reload() }}>{t('retry')}</button>
              </p>
            ) : null}
            {error === null && rows.length === 0 ? <p style={styles.secondarySmall}>{t('empty')}</p> : null}
            {rows.length > 0 ? (
              <div className="dsh-file-manage-card">
                {/* 只渲染窗口内行：预算裁剪 DOM（超出窗口靠「加载更多」延伸，配额 10000 不无界进 DOM）。 */}
                {rows.slice(0, renderLimit).map(row => (
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
            {/* 加载更多随列表滚动：放在当前列表最下面。 */}
            {hasLoadMore(rows.length, renderLimit, hasMore) && !initialLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12 }}>
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
          </>
        )}
      </div>

      {/* 合集品牌 footer：页面内容收尾。 */}
      <div className="dsh-file-manage-page-footer">🐦 dsh-sparrow</div>

      <Modal
        open={confirming !== null}
        // 删除进行中不许用遮罩 / Esc / 关闭键把确认框撤掉（请求未落定时状态会孤儿化）。
        onClose={() => { if (!busyDelete) setConfirming(null) }}
        title={t('delete')}
        closeLabel={t('confirm.cancel')}
        className="dsh-file-manage-confirm-dialog"
      >
        {confirming !== null ? (
          <>
            <p className="dsh-file-manage-confirm-desc">
              {confirming.dshOwned
                ? t('confirm.deleteDsh', { name: confirming.filename })
                : t('confirm.delete', { name: confirming.filename })}
            </p>
            <div className="dsh-file-manage-confirm-actions" style={{ marginTop: 20 }}>
              <button
                type="button"
                className="dsh-file-manage-btn"
                disabled={busyDelete}
                data-modal-autofocus
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
          </>
        ) : null}
      </Modal>
    </section>
  )
}
