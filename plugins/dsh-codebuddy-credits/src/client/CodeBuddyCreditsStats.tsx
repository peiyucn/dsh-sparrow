/**
 * 会话积分胶囊：DOM 级追加到官方统计行（槽位 conversation.composer.dock；该行自带 12px gap）。
 * 注入节点归 React 所有（portal），只 append/remove 自有节点，不包装、不替换官方子节点。
 * 数据走 host /session-usage（会话事件重放，重启后仍准确）；该会话无 CodeBuddy 调用时不注入。
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
/** 流式每步都变，去抖合并成一次本地查询。 */
const REFRESH_DEBOUNCE_MS = 800
/** 官方槽位锚点（官方 renderSlot 契约：每个渲染点都有稳定 wrapper）。 */
const DOCK_SELECTOR = '[data-slot="conversation.composer.dock"]'
/** 官方统计行标记（同官方 CSS 的 `:has([data-composer-stats])` 口径）。 */
const ROW_SELECTOR = '[data-composer-stats]'

interface SessionUsageView {
  credit: number
  calls: number
  byModel: ReadonlyArray<{ model: string; credit: number; calls: number }>
}

/** 槽位重挂载（切会话/视图）时以它初始化，避免「空 → 出现」闪烁。 */
const usageCache = new Map<string, SessionUsageView>()
/** 切过的会话数可无限增长，按 FIFO 淘汰最老条目。 */
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
        // 查询失败保持现状，不影响主流程。
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

  // 节点推进（流式/回合）→ 去抖刷新；本地查询，代价可忽略。
  const nodes = useChat(snapshot => snapshot.legacy?.nodes ?? null)
  useEffect(() => {
    const timer = setTimeout(() => { load() }, REFRESH_DEBOUNCE_MS)
    return () => { clearTimeout(timer) }
  }, [nodes, load])

  // 官方行每步重渲染会丢弃注入节点（也可能被整体换掉），故每次渲染后重解析落点并重挂；
  // 同引用时不 setState（React bail out，不会自激）；拿不到就置 null（不注入，fail-safe）。
  useEffect(() => {
    const holder = holderRef.current
    const dock = holder?.closest(DOCK_SELECTOR) ?? null
    // 无官方标记时退化到 dock 首个子节点（本条目 order 1，官方在 order 0）。
    const marked = dock?.querySelector(ROW_SELECTOR) ?? null
    const fallback = dock?.firstElementChild ?? null
    const host = marked ?? (fallback === holder ? null : fallback)
    const next = host !== null && host.isConnected ? host : null
    setRow(current => (current === next ? current : next))
  })

  // 官方两颗胶囊可能在我们注入之后才补上：React 新增子节点用 appendChild，我们的节点会停在
  // 中间而非行尾，故每次渲染后重挂到行尾（只移动自有节点、幂等）。
  useEffect(() => {
    const pill = buttonRef.current
    if (pill === null) return
    const host = pill.parentElement
    if (host === null || host.lastElementChild === pill) return
    host.appendChild(pill)
  })

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

/** 官方 `.pill` 是全胶囊 `999px`（不是固定 px 值）；写死 px 会与同行官方胶囊不一致。 */
const PILL_RADIUS = '999px'

/** 官方字号/行高设在外层 `.root`（`.pill` 上不设），我们不在其中、`font: inherit` 会大一档，故照抄。 */
const PILL_FONT_SIZE = 'calc(var(--dsh-content-font-size-secondary, 13px) - 1px)'
const PILL_LINE_HEIGHT = 'calc(20px + var(--dsh-content-font-delta-secondary, 0px))'

/** 逐条对齐官方 `.root` + `.pill`（全胶囊、tertiary 文案、hover 提亮、14px 图标、不自留外边距）。 */
export function ensureStatsStyles(): void {
  if (stylesInstalled || typeof document === 'undefined') return
  stylesInstalled = true
  const style = document.createElement('style')
  style.textContent = [
    '.ccb-session-stats-pill {',
    '  display: inline-flex; align-items: center; gap: 6px;',
    '  box-sizing: border-box; max-width: 100%;',
    '  padding: 1px 8px; border: none;',
    `  border-radius: ${PILL_RADIUS}; corner-shape: round;`,
    '  background: transparent; color: var(--dsw-alias-label-tertiary);',
    '  font: inherit; font-variant-numeric: tabular-nums;',
    `  font-size: ${PILL_FONT_SIZE};`,
    `  line-height: ${PILL_LINE_HEIGHT};`,
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
