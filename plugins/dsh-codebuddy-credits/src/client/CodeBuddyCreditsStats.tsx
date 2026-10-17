/**
 * 会话积分胶囊：`conversation.composer.dock` 这条 list 槽的一条普通 entry（order 2）。
 * 组件根节点直接就是官方 `.dock` flex 行里的 flex 子项（官方 activity order 0 / usage order 1
 * 两颗胶囊在前，ContextMeter 在槽位渲染点之后），顺序由槽位 order 决定，不做 DOM portal / 重挂。
 * 官方 rc.2 起旧锚点 `data-composer-stats` 已删除，官方胶囊拆成两条 entry（每颗带
 * `data-composer-stat`）、容器带 `data-composer-dock`（上游 `ui-conversation/src/client/skeleton/
 * InputBar.tsx:520`、`ui-chat/src/client/chat/StatsPills.tsx:175`）。
 * 数据走 host /session-usage（会话事件重放，重启后仍准确）；该会话无 CodeBuddy 调用时不渲染。
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

  const active = usage !== undefined && usage.calls > 0

  return (
    <>
      {active
        ? (
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
          </button>
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

/** 官方 `.pill` 圆角是紧凑控件档 R8（上游 `ui-chat/src/client/chat/StatsPills.module.css:21`；999px 是旧口径）。 */
const PILL_RADIUS = 'var(--dsw-radius-sm)'

/** 官方字号/行高设在外层 `.anchor`（`.pill` 上不设），我们不在其中、`font: inherit` 会大一档，故照抄。 */
const PILL_FONT_SIZE = 'calc(var(--dsh-content-font-size-secondary, 13px) - 1px)'
const PILL_LINE_HEIGHT = 'calc(20px + var(--dsh-content-font-delta-secondary, 0px))'

/** 逐条对齐官方 `.anchor` + `.pill`（紧凑控件圆角、tertiary 文案、hover 提亮、14px 图标、不自留外边距）。 */
export function ensureStatsStyles(): void {
  if (stylesInstalled || typeof document === 'undefined') return
  stylesInstalled = true
  const style = document.createElement('style')
  style.textContent = [
    '.ccb-session-stats-pill {',
    '  display: inline-flex; align-items: center; gap: 6px;',
    '  box-sizing: border-box; max-width: 100%;',
    '  padding: 1px 8px; border: none;',
    `  border-radius: ${PILL_RADIUS};`,
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
