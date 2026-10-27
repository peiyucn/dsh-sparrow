/**
 * 每轮积分胶囊：挂官方 conversation.chat.assistant-actions 槽位（官方渲染在复制与分支之间），我们 DOM 级把自有节点
 * 移到行动作行末尾——只移动自有节点，不包装/替换官方组件；点击展开 CreditDialog 共享的官方同款材质面板。
 * 数据走 host /turn-usage 路由（按 sessionId+turn 记账）；该轮没有 CodeBuddy 调用（calls=0）时不渲染。
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CodeBuddyMark } from './CodeBuddyMark.js'
import { CreditDialog } from './CreditDialog.js'
import { MEASURE_STYLE, useCreditStatDialog } from './statDialog.js'
import { fetchLocal } from './fetch-timeout.js'
import { formatCredits } from './format.js'
import { API_PREFIX } from '../constants.js'
import { CCB_CLASS } from './styles.js'

const TURN_USAGE_URL = `${API_PREFIX}/turn-usage`

/** 每轮积分视图（host /turn-usage 响应）。 */
export interface TurnUsageView {
  credit: number
  calls: number
  /** 按模型聚合的调用明细（同模型多次调用合并一行）。 */
  byModel: ReadonlyArray<{ model: string; credit: number; calls: number }>
}

/** 官方 ChatSnapshot 的最小面（turn-tail 节点的 closing 记录 messageId）。 */
interface SnapshotLike {
  order?: readonly string[]
  nodes?: {
    get(key: string): {
      kind?: string
      data?: { turn?: number; closing?: { finalNode?: { messageId?: string } } | null }
    } | undefined
  }
}

export interface CodeBuddyTurnCreditProps {
  t: (key: string, vars?: Record<string, string>) => string
  /** 槽位 owner：完成态的 assistant 消息 id。 */
  messageId: string
  /** 会话标准套件（ui-session）。 */
  sessionId: string
  /** 会话标准套件（ui-chat）：ChatSnapshot 选择器。 */
  useChat: <T>(selector: (snapshot: SnapshotLike) => T) => T
}

export function CodeBuddyTurnCredit({ t, messageId, sessionId, useChat }: CodeBuddyTurnCreditProps) {
  const [usage, setUsage] = useState<TurnUsageView | undefined>(undefined)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const { open, toggle, panelRef, pos } = useCreditStatDialog(buttonRef)

  // 每次渲染后重跑：官方行可能因任何信号重渲染把我们移回原位；只移动自有节点，幂等。
  useEffect(() => {
    const pill = buttonRef.current
    if (pill === null) return
    const row = pill.parentElement
    if (row === null || row.lastElementChild === pill) return
    row.appendChild(pill)
  })

  // messageId → turn：扫描快照里的 turn-tail 节点（官方同款关联：closing.
  // finalNode.messageId）。找不到（历史未装载/非完成态）返回 null → 不渲染。
  const turn = useChat((snapshot) => {
    const nodes = snapshot.nodes
    if (nodes === undefined) return null
    for (const key of snapshot.order ?? []) {
      const node = nodes.get(key)
      if (node?.kind === 'turn-tail' && node.data?.closing?.finalNode?.messageId === messageId) {
        return node.data.turn ?? null
      }
    }
    return null
  })

  useEffect(() => {
    if (turn === null || turn === undefined) return
    let alive = true
    void fetchLocal(`${TURN_USAGE_URL}?sessionId=${encodeURIComponent(sessionId)}&turn=${turn}`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() as Promise<TurnUsageView> : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(value => { if (alive) setUsage(value) })
      .catch(() => { if (alive) setUsage(undefined) })
    return () => { alive = false }
  }, [sessionId, turn])

  // 未取到用量或无 CodeBuddy 调用（calls=0）时不渲染。
  if (usage === undefined || usage.calls === 0) return null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={CCB_CLASS.turnTrigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('turnCredit.aria', { credit: formatCredits(usage.credit) })}
        onClick={toggle}
      >
        <CodeBuddyMark />
        <span className={CCB_CLASS.turnLabel}>{t('turnCredit.label', { credit: formatCredits(usage.credit) })}</span>
      </button>
      {open
        ? createPortal(
          <CreditDialog
            panelRef={panelRef}
            style={pos ?? MEASURE_STYLE}
            ariaLabel={t('turnCredit.title')}
            title={t('turnCredit.title')}
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
