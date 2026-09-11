/**
 * 积分弹层皮肤（每轮积分胶囊与会话积分胶囊共用）：inline 复刻官方 ui-chat
 * stat-dialog.module.css 的配方——menu 表面 + 12px 圆角 + elevation-prominent
 * + 12/18 正文色阶；标题行（左：品牌标 + 标题，右：高亮值）、标题下细线、
 * 两列 details 网格（dt 左 tertiary / dd 右 secondary + tabular-nums）。
 * 官方样式表不在插件的依赖面内，故这里按同一配方展开，不引入自有设计。
 * 定位由调用方给（useCreditStatDialog 的 pos，量到真实尺寸后在视口内钳制）。
 */

import { Fragment } from 'react'
import type { CSSProperties, MutableRefObject } from 'react'
import { CodeBuddyMark } from './CodeBuddyMark.js'
import { formatCredits } from './format.js'

/** 官方 stat-dialog.module.css `.panel`（placement 由 pos 提供）。 */
const panelStyle: CSSProperties = {
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
  cursor: 'default',
} as CSSProperties

/** 官方 `.title`：标题行两端对齐，值加粗到 primary。 */
const titleStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '16px',
  marginBottom: '8px',
  color: 'var(--dsw-alias-label-primary)',
  fontWeight: 500,
}

/** 官方 `.titleLabel`：品牌标与标题同排，标不随文字压缩。 */
const titleLabelStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  minWidth: 0,
}

const titleRuleStyle: CSSProperties = {
  marginBottom: '10px',
  borderTop: '0.5px solid var(--dsw-alias-border-l2)',
}

/** 官方 `.details`：两列网格，行距 6px、列距 16px。 */
const detailsStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(76px, auto) minmax(0, 1fr)',
  gap: '6px 16px',
  margin: 0,
  color: 'var(--dsw-alias-label-tertiary)',
}

const termStyle: CSSProperties = { margin: 0, minWidth: 0 }

/** 分组小标题（「每次调用」）横跨两列，与上一块拉开一点距离。 */
const groupStyle: CSSProperties = { ...termStyle, gridColumn: '1 / -1', paddingTop: '4px' }

const valueStyle: CSSProperties = {
  margin: 0,
  minWidth: 0,
  color: 'var(--dsw-alias-label-secondary)',
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'right',
}

/** 模型名可任意位置换行（长 id 不撑破面板），数值不换行。 */
const modelStyle: CSSProperties = { ...termStyle, overflowWrap: 'anywhere' }

export interface CreditDialogProps {
  /** 弹层本体（量尺寸 + 外点关闭判定用）。 */
  panelRef: MutableRefObject<HTMLDivElement | null>
  /** 定位坐标；首次测量前为 null（此时按 MEASURE_STYLE 不可见预排）。 */
  style: CSSProperties
  /** 无障碍名（与标题一致或更完整）。 */
  ariaLabel: string
  /** 标题文案（本轮 / 本会话）。 */
  title: string
  /** 高亮总值（标题行右侧）。 */
  credit: number
  /** 「调用次数」标签。 */
  callsLabel: string
  calls: number
  /** 「每次调用」分组标签。 */
  perCallLabel: string
  /** 按模型聚合的明细（同模型多次调用合并一行）。 */
  byModel: ReadonlyArray<{ model: string; credit: number; calls: number }>
}

/**
 * 积分弹层（本轮 / 本会话同款）。
 * @param props - 标题、总值、调用次数与按模型明细，外加定位与 ref。
 * @returns 官方 stat-dialog 同皮的面板。
 */
export function CreditDialog({
  panelRef, style, ariaLabel, title, credit, callsLabel, calls, perCallLabel, byModel,
}: CreditDialogProps) {
  return (
    <div ref={panelRef} role="dialog" aria-label={ariaLabel} style={{ ...panelStyle, ...style }}>
      <div style={titleStyle}>
        <span style={titleLabelStyle}>
          <CodeBuddyMark size={14} />
          {title}
        </span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCredits(credit)}</span>
      </div>
      <div style={titleRuleStyle} aria-hidden />
      <dl style={detailsStyle}>
        <dt style={termStyle}>{callsLabel}</dt>
        <dd style={valueStyle}>{String(calls)}</dd>
        {byModel.length > 0
          ? (
            <>
              <dt style={groupStyle}>{perCallLabel}</dt>
              {byModel.map((call, index) => (
                <Fragment key={index}>
                  <dt style={modelStyle}>
                    {call.model}{call.calls > 1 ? ` ×${call.calls}` : ''}
                  </dt>
                  <dd style={valueStyle}>{formatCredits(call.credit)}</dd>
                </Fragment>
              ))}
            </>
          )
          : null}
      </dl>
    </div>
  )
}
