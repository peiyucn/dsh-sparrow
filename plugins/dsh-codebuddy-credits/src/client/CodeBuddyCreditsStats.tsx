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
import { API_PREFIX } from '../constants.js'
import { CCB_CLASS } from './styles.js'

const SESSION_USAGE_URL = `${API_PREFIX}/session-usage`
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
            className={CCB_CLASS.statsPill}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={t('stats.sessionCreditsAria', {
              credit: formatCredits(usage.credit),
              calls: String(usage.calls),
            })}
            onClick={toggle}
          >
            <CodeBuddyMark />
            <span className={CCB_CLASS.statsLabel}>
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
