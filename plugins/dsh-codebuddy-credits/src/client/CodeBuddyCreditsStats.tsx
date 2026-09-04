/**
 * 会话积分统计分段：挂官方 conversation.composer.dock 槽位（与官方 StatsLine
 * 同槽位）。不再单独占一行——DOM 级把「CodeBuddy credits X · Y calls」追加到
 * 官方统计行（dock 第一个子节点，官方锚点契约 data-slot 可寻址）末尾，作为
 * 该行最后一个 | 分段，材质随官方行（tertiary、nowrap、省略号）。官方行每次
 * 重渲染（每步）会清掉注入节点，本组件以相同 nodes 信号在 commit 后重建，
 * 无可见闪断；该会话没有 CodeBuddy 调用时不注入。
 * 数据走 host /session-usage（进程内 usage 记账），节点推进去抖刷新。
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
  const anchorRef = useRef<HTMLDivElement | null>(null)
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

  // 把分段追加进官方统计行末尾。依赖 nodes：官方行每次重渲染（每步）会移除
  // 注入节点，本 effect 在同信号下重跑重建，视觉上无断档。
  useEffect(() => {
    const anchor = anchorRef.current
    if (anchor === null) return
    if (usage === undefined || usage.calls === 0) return
    const dock = anchor.closest('[data-slot="conversation.composer.dock"]')
    const host = dock?.firstElementChild
    if (host === null || host === undefined || host === anchor) return
    let segment = host.querySelector<HTMLSpanElement>('.ccb-session-stats-segment')
    if (segment === null) {
      const sep = document.createElement('span')
      sep.className = 'ccb-session-stats-sep'
      sep.setAttribute('aria-hidden', 'true')
      sep.textContent = '|'
      segment = document.createElement('span')
      segment.className = 'ccb-session-stats-segment'
      host.append(' ', sep, ' ', segment)
    }
    segment.textContent = t('stats.sessionCredits', {
      credit: formatCredits(usage.credit),
      calls: String(usage.calls),
    })
    return () => {
      segment.remove()
      host.querySelector('.ccb-session-stats-sep')?.remove()
    }
  }, [usage, t, nodes])

  return <div ref={anchorRef} style={{ display: 'none' }} />
}

let stylesInstalled = false

/** 注入分段的分隔符样式（对齐官方 | 分隔符：separator-primary + 左右 10px）。 */
export function ensureStatsStyles(): void {
  if (stylesInstalled || typeof document === 'undefined') return
  stylesInstalled = true
  const style = document.createElement('style')
  style.textContent = [
    '.ccb-session-stats-sep {',
    '  color: var(--dsw-alias-separator-primary);',
    '  margin: 0 10px;',
    '}',
  ].join('\n')
  document.head.append(style)
}
