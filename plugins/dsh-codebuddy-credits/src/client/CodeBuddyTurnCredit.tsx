/**
 * 每轮积分胶囊：挂官方 conversation.chat.assistant-actions 槽位——该槽位渲染
 * 在复制与分支之间（官方顺序：复制 → 本槽位 → 分支 → Usage → 时间），我们
 * DOM 级把本插件自有节点移动到行动作行末尾（时间之后，真正的行尾），只移动
 * 自有节点，不包装/替换官方组件。材质与官方胶囊一致（transparent + 28px 圆角
 * + tertiary 文案，hover 提亮）；点击展开官方 Turn usage 弹窗同款材质的面板
 * （CreditDialog 共享件），内容精简为：本轮总积分、调用次数、每次调用（按模型
 * 聚合）的积分。
 * 数据走 host /turn-usage 路由（按 sessionId+turn 记账；host 端经 agent/request
 * 载荷的 signal 与 usage 帧精确关联轮次）。该轮没有 CodeBuddy 调用（calls=0）
 * 时不渲染，官方行动作行保持原样。
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CodeBuddyMark } from './CodeBuddyMark.js'
import { CreditDialog } from './CreditDialog.js'
import { MEASURE_STYLE, useCreditStatDialog } from './statDialog.js'
import { fetchLocal } from './fetch-timeout.js'
import { formatCredits } from './format.js'

const TURN_USAGE_URL = '/api/codebuddy-credits/turn-usage'

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

  // 槽位固定渲染在复制与分支之间（官方顺序）；用户要求胶囊放到行动作行末尾
  // （时间之后）——DOM 级移动本插件自有节点到行尾（appendChild）。每次渲染后
  // 重试（官方行可能因任何信号重渲染把我们移回原位），只移动自有节点、幂等。
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

  // 该轮没有 CodeBuddy 调用：不渲染，官方行动作行保持原样。
  if (usage === undefined || usage.calls === 0) return null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="ccb-turn-credit-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('turnCredit.aria', { credit: formatCredits(usage.credit) })}
        onClick={toggle}
      >
        <CodeBuddyMark />
        <span className="ccb-turn-credit-label">{t('turnCredit.label', { credit: formatCredits(usage.credit) })}</span>
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

let stylesInstalled = false

/** 胶囊样式（对齐官方 TurnUsagePanel.module.css 的 .trigger 配方）。 */
export function ensureTurnCreditStyles(): void {
  if (stylesInstalled || typeof document === 'undefined') return
  stylesInstalled = true
  const style = document.createElement('style')
  style.textContent = [
    // 官方 .trigger 配方：28px 高、圆角胶囊、tertiary 文案、hover 提亮。
    '.ccb-turn-credit-trigger {',
    '  display: inline-flex; align-items: center; gap: 6px; min-width: 0;',
    '  height: calc(28px + var(--dsh-content-font-delta, 0px));',
    '  padding: 6px 8px; border: none; border-radius: 28px;',
    '  background: transparent; color: var(--dsw-alias-label-tertiary);',
    '  font-size: var(--dsh-content-font-size-secondary, 13px);',
    '  font-variant-numeric: tabular-nums;',
    '  line-height: calc(24px + var(--dsh-content-font-delta, 0px));',
    '  white-space: nowrap; cursor: pointer;',
    '}',
    '.ccb-turn-credit-trigger svg {',
    '  width: calc(15px + var(--dsh-content-font-delta, 0px)); height: calc(15px + var(--dsh-content-font-delta, 0px)); flex: none;',
    '}',
    '.ccb-turn-credit-trigger:hover, .ccb-turn-credit-trigger[aria-expanded="true"] {',
    '  background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary);',
    '}',
    '.ccb-turn-credit-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }',
    '@media (max-width: 480px) {',
    '  .ccb-turn-credit-trigger { justify-content: center; width: calc(28px + var(--dsh-content-font-delta, 0px)); padding: 6px; }',
    '  .ccb-turn-credit-label { display: none; }',
    '}',
  ].join('\n')
  document.head.append(style)
}
