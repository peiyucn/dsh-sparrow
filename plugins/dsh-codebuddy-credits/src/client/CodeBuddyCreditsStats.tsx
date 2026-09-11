/**
 * 会话积分胶囊：挂官方 conversation.composer.dock 槽位（与官方统计行同槽位）。
 *
 * 官方 0.1.5-rc.2 起统计行是**一排胶囊**（图标 + 文案，24px 圆角、tertiary
 * 文案、hover 提亮、点击开弹层；官方 StatsPills.module.css 的 `.pill`），所以
 * 这里也做成一枚**同款第三颗胶囊**：DOM 级把自有按钮追加到官方行的 flex 末尾
 * （官方行自带 12px gap，材质随行），点击展开与官方 stat-dialog 同皮的会话
 * 明细弹层（总积分 / 调用次数 / 按模型明细）。
 *
 * 注入节点归 React 所有（portal 进官方行——事件、aria、开合状态都由 React 管），
 * 只 append/remove 自有节点，不包装、不替换任何官方子节点；官方行每次重渲染
 * （每步）会丢弃注入节点，本组件以相同 nodes 信号重新解析落点并重挂，视觉无
 * 断档。该会话没有 CodeBuddy 调用时不注入，官方统计行保持原样。
 * 数据走 host /session-usage（进程内 usage 记账），节点推进去抖刷新。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { boundedSet } from './boundedCache.js'
import { CodeBuddyMark } from './CodeBuddyMark.js'
import { CreditDialog } from './CreditDialog.js'
import { MEASURE_STYLE, useCreditStatDialog } from './statDialog.js'
import { fetchLocal } from './fetch-timeout.js'
import { formatCredits } from './format.js'

const SESSION_USAGE_URL = '/api/codebuddy-credits/session-usage'
/** 节点推进后的刷新去抖（流式每步都变，800ms 合并成一次本地查询）。 */
const REFRESH_DEBOUNCE_MS = 800
/** 官方统计行的槽位锚点（官方 renderSlot 契约：每个渲染点都有稳定 wrapper）。 */
const DOCK_SELECTOR = '[data-slot="conversation.composer.dock"]'
/** 官方统计行自身的标记（官方 CSS 的 `:has([data-composer-stats])` 同款）。 */
const ROW_SELECTOR = '[data-composer-stats]'

interface SessionUsageView {
  credit: number
  calls: number
  /** 按模型聚合的调用明细（同模型多次调用合并一行）。 */
  byModel: ReadonlyArray<{ model: string; credit: number; calls: number }>
}

/** 会话级缓存：槽位重挂载（切会话/视图）时以它初始化，避免「空 → 出现」闪烁。 */
const usageCache = new Map<string, SessionUsageView>()
/** 缓存条目上限：切过的会话数可无限增长，按 FIFO 淘汰最老条目（有界，审计「按会话累积状态」条目）。 */
const USAGE_CACHE_MAX = 200

export interface CodeBuddyCreditsStatsProps {
  t: (key: string, vars?: Record<string, string>) => string
  /** 会话标准套件（ui-session）。 */
  sessionId: string
  /** 会话标准套件（ui-chat）：以快照节点数组身份作为「推进」信号。 */
  useChat: <T>(selector: (snapshot: { legacy?: { nodes?: readonly unknown[] } | null }) => T) => T
}

export function CodeBuddyCreditsStats({ t, sessionId, useChat }: CodeBuddyCreditsStatsProps) {
  const [usage, setUsage] = useState<SessionUsageView | undefined>(() => usageCache.get(sessionId))
  const holderRef = useRef<HTMLDivElement | null>(null)
  const [row, setRow] = useState<Element | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const { open, toggle, panelRef, pos } = useCreditStatDialog(buttonRef)

  const load = useCallback(() => {
    void fetchLocal(`${SESSION_USAGE_URL}?sessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() as Promise<SessionUsageView> : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(value => {
        boundedSet(usageCache, sessionId, value, USAGE_CACHE_MAX)
        setUsage(value)
      })
      .catch(() => {
        // 查询失败保持现状（保守，不影响主流程）。
      })
  }, [sessionId])

  useEffect(() => {
    load()
    const onStatusChanged = () => { load() }
    const onFocus = () => { load() }
    window.addEventListener('codebuddy-credits-status-changed', onStatusChanged)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('codebuddy-credits-status-changed', onStatusChanged)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  // 节点身份变化（流式/回合推进）→ 去抖刷新：本地查询，代价可忽略。
  const nodes = useChat(snapshot => snapshot.legacy?.nodes ?? null)
  useEffect(() => {
    const timer = setTimeout(() => { load() }, REFRESH_DEBOUNCE_MS)
    return () => { clearTimeout(timer) }
  }, [nodes, load])

  // 解析官方统计行，并跟随它的重建：官方行每步重渲染、也可能被整体换掉
  // （或在我们挂载之后才因首步出现），所以每次渲染后重新解析一次——DOM 读
  // 两次 querySelector，代价可忽略；解析结果与当前 state 同引用时不 setState
  // （React 直接 bail out，不会自激）。拿不到就置 null（不注入，fail-safe）。
  useEffect(() => {
    const holder = holderRef.current
    const dock = holder?.closest(DOCK_SELECTOR) ?? null
    // 先认官方统计行自身的标记（官方 CSS 的 `:has([data-composer-stats])`
    // 同款）；退化到 dock 首个子节点（本条目 order 1，官方在 order 0）。
    const marked = dock?.querySelector(ROW_SELECTOR) ?? null
    const fallback = dock?.firstElementChild ?? null
    const host = marked ?? (fallback === holder ? null : fallback)
    const next = host !== null && host.isConnected ? host : null
    setRow(current => (current === next ? current : next))
  })

  // 没有 CodeBuddy 调用：不注入，官方统计行保持原样。
  const active = row !== null && usage !== undefined && usage.calls > 0

  return (
    <>
      <div ref={holderRef} style={{ display: 'none' }} />
      {active
        ? createPortal(
          <button
            ref={buttonRef}
            type="button"
            className="ccb-session-stats-pill"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={t('stats.sessionCreditsAria', {
              credit: formatCredits(usage.credit),
              calls: String(usage.calls),
            })}
            onClick={toggle}
          >
            <CodeBuddyMark />
            <span className="ccb-session-stats-label">
              {t('stats.sessionCredits', {
                credit: formatCredits(usage.credit),
                calls: String(usage.calls),
              })}
            </span>
          </button>,
          row,
        )
        : null}
      {active && open
        ? createPortal(
          <CreditDialog
            panelRef={panelRef}
            style={pos ?? MEASURE_STYLE}
            ariaLabel={t('stats.sessionCreditsTitle')}
            title={t('stats.sessionCreditsTitle')}
            credit={usage.credit}
            callsLabel={t('turnCredit.calls')}
            calls={usage.calls}
            perCallLabel={t('turnCredit.perCall')}
            byModel={usage.byModel}
          />,
          document.body,
        )
        : null}
    </>
  )
}

let stylesInstalled = false

/**
 * 注入胶囊的样式（对齐官方 StatsPills.module.css 的 `.pill`：字号行高随官方行
 * 继承的 13/20、1px 8px 内边距、24px 圆角、tertiary 文案、hover 提亮、14px
 * 图标）。官方行自带 12px gap，胶囊不自留外边距；官方行与官方两颗胶囊的
 * 标签都自带 `min-width:0 + 省略号`，故窄屏下三颗一起收窄而非溢出。
 */
export function ensureStatsStyles(): void {
  if (stylesInstalled || typeof document === 'undefined') return
  stylesInstalled = true
  const style = document.createElement('style')
  style.textContent = [
    '.ccb-session-stats-pill {',
    '  display: inline-flex; align-items: center; gap: 6px;',
    '  box-sizing: border-box; max-width: 100%;',
    '  padding: 1px 8px; border: none; border-radius: 24px;',
    '  background: transparent; color: var(--dsw-alias-label-tertiary);',
    '  font: inherit; font-variant-numeric: tabular-nums; line-height: inherit;',
    '  white-space: nowrap; cursor: pointer;',
    '}',
    '.ccb-session-stats-pill svg {',
    '  width: 14px; height: 14px; flex: none;',
    '}',
    '.ccb-session-stats-pill:hover, .ccb-session-stats-pill[aria-expanded="true"] {',
    '  background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary);',
    '}',
    '.ccb-session-stats-label {',
    '  min-width: 0; overflow: hidden; text-overflow: ellipsis;',
    '}',
  ].join('\n')
  document.head.append(style)
}
