/**
 * 每轮积分胶囊：挂在官方 conversation.chat.assistant-actions 槽位——官方
 * Usage 胶囊（TurnUsagePanel）同排（官方渲染顺序：复制 → 本槽位 → 分支 →
 * Usage → 时间），材质与官方胶囊一致（transparent + 28px 圆角 + tertiary
 * 文案，hover 用 interactive-bg-hover）。显示该轮 CodeBuddy 积分合计；
 * 点击展开官方 Turn usage 弹窗同款材质的面板：本轮合计、调用次数、每次
 * 调用明细（模型 + 积分）。数据走 host /turn-usage 路由（按 sessionId+turn
 * 记账；host 端经 agent/request 载荷的 signal 与 usage 帧精确关联轮次）。
 * 该轮没有 CodeBuddy 调用（calls=0）时不渲染，官方行动作行保持原样。
 *
 * 图标：lobehub/lobe-icons 的 codebuddy.svg（黑白，fill=currentColor，
 * 随主题着色，MIT），来源 https://lobehub.com/icons/codebuddy。
 */

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'

const TURN_USAGE_URL = '/api/codebuddy-credits/turn-usage'

/** 积分数字：整数不挂小数位（2000），非整数保留两位（0.41/1999.59）。 */
function formatCredits(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

/** lobehub/lobe-icons codebuddy.svg（黑白标，viewBox 24×24）。 */
export const CODEBUDDY_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18.777 1.647c.28-.02.536.114.972.51 1.018.926 2.437 2.828 3.318 4.452l.34.631.482.24.11.06v3.638a5.206 5.206 0 00-5.32-1.23c-.491.166-1.021.471-2.08 1.082l-6.09 3.516c-1.057.61-1.586.916-1.975 1.259a5.208 5.208 0 00-1.493 5.572c.165.49.471 1.02 1.082 2.08l.315.543h-3.26c-.685 0-1.34-.135-1.939-.377-.169-.956-.009-1.789.469-2.335.158-.18.164-.189.13-.493a11.846 11.846 0 01-.057-1.711l.02-.444-.667-1.18C2.1 15.622 1.445 14.078 1.192 12.9c-.133-.647-.125-.934.04-1.146.1-.128.427-.261.822-.334.994-.175 3.162-.017 5.575.41l.25.043.551-.487c.915-.81 1.522-1.264 2.641-1.962 1.167-.73 2.484-1.331 3.967-1.807l.476-.152.261-.688c.937-2.471 1.896-4.293 2.58-4.9.235-.21.25-.22.422-.23z" fill="currentColor"></path><path d="M12.139 18.2a1.203 1.203 0 011.642.44l1.296 2.243a1.204 1.204 0 01-2.083 1.203l-1.296-2.243a1.203 1.203 0 01.44-1.644zM18.629 14.452a1.203 1.203 0 011.642.44l1.295 2.244a1.203 1.203 0 11-2.083 1.203l-1.295-2.243a1.203 1.203 0 01.44-1.644z" fill="currentColor"></path></svg>'

/** 每轮积分视图（host /turn-usage 响应）。 */
export interface TurnUsageView {
  credit: number
  calls: number
  recent: ReadonlyArray<{ model: string; credit?: number }>
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

/** 官方 Turn usage 弹窗同款面板材质。 */
const panelBase: CSSProperties = {
  position: 'fixed',
  zIndex: 1100,
  boxSizing: 'border-box',
  width: 'max-content',
  minWidth: 'min(300px, calc(100vw - 24px))',
  maxWidth: 'min(440px, calc(100vw - 24px))',
  padding: '16px',
  border: '0',
  borderRadius: '12px',
  background: 'var(--dsw-specific-menu)',
  '--dsw-elevation-stroke-color': 'var(--dsw-alias-border-l1)',
  boxShadow: 'var(--dsw-elevation-prominent)',
  fontSize: '12px',
  lineHeight: '18px',
  color: 'var(--dsw-alias-label-secondary)',
} as CSSProperties

export function CodeBuddyTurnCredit({ t, messageId, sessionId, useChat }: CodeBuddyTurnCreditProps) {
  const [usage, setUsage] = useState<TurnUsageView | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [point, setPoint] = useState<{ left: number; bottom: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  // 槽位固定渲染在复制与分支之间（官方顺序）；用户要求胶囊放到行尾时间之前——
  // DOM 级移动本插件自有节点：assistant 消息的行动作行末尾就是时间元素，
  // 把胶囊插到行内最后一个元素之前（时间缺失时兜底落到 Usage 胶囊之后，
  // 仍在行尾）。只移动自有节点，不包装/替换官方组件。
  useEffect(() => {
    const pill = buttonRef.current
    if (pill === null) return
    const row = pill.parentElement
    if (row === null || row.lastElementChild === null || row.lastElementChild === pill) return
    row.insertBefore(pill, row.lastElementChild)
  }, [usage !== undefined && usage.calls > 0])

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
    void fetch(`${TURN_USAGE_URL}?sessionId=${encodeURIComponent(sessionId)}&turn=${turn}`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() as Promise<TurnUsageView> : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(value => { if (alive) setUsage(value) })
      .catch(() => { if (alive) setUsage(undefined) })
    return () => { alive = false }
  }, [sessionId, turn])

  const computePoint = useCallback((): { left: number; bottom: number } | null => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect === undefined) return null
    // 面板左缘对齐胶囊；靠右时钳制，避免面板溢出视口右缘（面板自带
    // max-width: min(440px, 100vw-24px)，钳制只保右缘 12px 边距）。
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - 12 - 440))
    return { left, bottom: window.innerHeight - rect.top + 8 }
  }, [])

  // 弹层打开时：点外部关闭、Esc 关闭、滚动/缩放跟随重定位（官方下拉同款）。
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      if (!(event.target instanceof Element)) return
      if (event.target.closest('.ccb-turn-credit-panel') !== null) return
      if (buttonRef.current !== null && buttonRef.current.contains(event.target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    const reposition = (): void => {
      const next = computePoint()
      if (next === null) setOpen(false)
      else setPoint(next)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, computePoint])

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
        onClick={() => {
          if (open) setOpen(false)
          else {
            setPoint(computePoint())
            setOpen(true)
          }
        }}
      >
        <span style={{ display: 'inline-flex', flex: 'none' }} dangerouslySetInnerHTML={{ __html: CODEBUDDY_ICON }} />
        <span className="ccb-turn-credit-label">{t('turnCredit.label', { credit: formatCredits(usage.credit) })}</span>
      </button>
      {open && point !== null
        ? createPortal(
          <div
            className="ccb-turn-credit-panel"
            role="dialog"
            aria-label={t('turnCredit.title')}
            style={{ ...panelBase, left: point.left, bottom: point.bottom }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '8px', color: 'var(--dsw-alias-label-primary)', fontWeight: 500 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                <span style={{ display: 'inline-flex', flex: 'none' }} dangerouslySetInnerHTML={{ __html: CODEBUDDY_ICON }} />
                {t('turnCredit.title')}
              </span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCredits(usage.credit)}</span>
            </div>
            <div style={{ marginBottom: '10px', borderTop: '0.5px solid var(--dsw-alias-border-l2)' }} aria-hidden />
            <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(76px, auto) minmax(0, 1fr)', gap: '6px 16px', margin: 0, color: 'var(--dsw-alias-label-tertiary)' }}>
              <dt style={{ margin: 0, minWidth: 0 }}>{t('turnCredit.calls')}</dt>
              <dd style={{ margin: 0, minWidth: 0, color: 'var(--dsw-alias-label-secondary)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                {String(usage.calls)}
              </dd>
              {usage.recent.length > 0
                ? (
                  <>
                    <dt style={{ margin: 0, minWidth: 0, gridColumn: '1 / -1', paddingTop: '4px' }}>{t('turnCredit.recent')}</dt>
                    {usage.recent.map((call, index) => (
                      <Fragment key={index}>
                        <dt style={{ margin: 0, minWidth: 0, overflowWrap: 'anywhere' }}>{call.model}</dt>
                        <dd style={{ margin: 0, minWidth: 0, color: 'var(--dsw-alias-label-secondary)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                          {call.credit === undefined ? '–' : formatCredits(call.credit)}
                        </dd>
                      </Fragment>
                    ))}
                  </>
                )
                : null}
            </dl>
          </div>,
          document.body,
        )
        : null}
    </>
  )
}

let stylesInstalled = false

/** 胶囊与弹层的样式（对齐官方 TurnUsagePanel.module.css 的材质配方）。 */
export function ensureTurnCreditStyles(): void {
  if (stylesInstalled || typeof document === 'undefined') return
  stylesInstalled = true
  const style = document.createElement('style')
  style.textContent = [
    // 官方 .trigger 配方：28px 高、圆角胶囊、tertiary 文案、hover 提亮。
    '.ccb-turn-credit-trigger {',
    '  display: inline-flex; align-items: center; gap: 4px; min-width: 0;',
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
