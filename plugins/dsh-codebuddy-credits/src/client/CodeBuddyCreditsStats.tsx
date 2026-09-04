/**
 * 会话积分统计行：挂官方 conversation.composer.dock 槽位（官方 StatsLine
 * 同槽位、同 list；order 1 渲染在其后一行）——材质对齐官方统计行（13/20
 * tertiary 居中、内容列同宽、省略号截断）。显示本会话累计积分与调用次数；
 * 该会话没有 CodeBuddy 调用时不渲染（官方统计行保持原样）。
 * 数据走 host /session-usage（进程内 usage 记账）：首挂/切会话/节点推进
 * （流式与回合）节流刷新；配置卡保存/清空 Key 与窗口聚焦联动刷新。
 */

import { useCallback, useEffect, useRef, useState } from 'react'

const SESSION_USAGE_URL = '/api/codebuddy-credits/session-usage'
/** 节点推进后的刷新去抖（流式每步都变，800ms 合并成一次本地查询）。 */
const REFRESH_DEBOUNCE_MS = 800

/** 积分数字：整数不挂小数位（2000），非整数保留两位（0.41/1999.59）。 */
function formatCredits(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

interface SessionUsageView {
  credit: number
  calls: number
}

/** 会话级缓存：槽位重挂载（切会话/视图）时以它初始化，避免「空 → 出现」闪烁。 */
const usageCache = new Map<string, SessionUsageView>()

export interface CodeBuddyCreditsStatsProps {
  t: (key: string, vars?: Record<string, string>) => string
  /** 会话标准套件（ui-session）。 */
  sessionId: string
  /** 会话标准套件（ui-chat）：以快照节点数组身份作为「推进」信号。 */
  useChat: <T>(selector: (snapshot: { legacy?: { nodes?: readonly unknown[] } | null }) => T) => T
}

export function CodeBuddyCreditsStats({ t, sessionId, useChat }: CodeBuddyCreditsStatsProps) {
  const [usage, setUsage] = useState<SessionUsageView | undefined>(() => usageCache.get(sessionId))
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(() => {
    void fetch(`${SESSION_USAGE_URL}?sessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() as Promise<SessionUsageView> : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(value => {
        usageCache.set(sessionId, value)
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
    if (debounceRef.current !== null) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { load() }, REFRESH_DEBOUNCE_MS)
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current)
    }
  }, [nodes, load])

  // 该会话没有 CodeBuddy 调用：不渲染。
  if (usage === undefined || usage.calls === 0) return null
  return (
    <div className="ccb-session-stats">
      {t('stats.sessionCredits', {
        credit: formatCredits(usage.credit),
        calls: String(usage.calls),
      })}
    </div>
  )
}

let stylesInstalled = false

/** 统计行样式：对齐官方 StatsLine 配方（13/20 tertiary 居中 + 内容列同宽 + 省略号）。 */
export function ensureStatsStyles(): void {
  if (stylesInstalled || typeof document === 'undefined') return
  stylesInstalled = true
  const style = document.createElement('style')
  style.textContent = [
    '.ccb-session-stats {',
    '  display: block; text-align: center;',
    '  max-width: var(--dsh-chat-content-width); width: 100%;',
    '  margin: 0 auto; box-sizing: border-box;',
    '  padding: 4px calc(var(--dsh-composer-side-clearance) + 16px) 0px;',
    '  font-size: var(--dsh-content-font-size-secondary, 13px);',
    '  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));',
    '  color: var(--dsw-alias-label-tertiary);',
    '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
    '}',
  ].join('\n')
  document.head.append(style)
}
