/**
 * 积分弹层皮肤（每轮 / 会话积分胶囊共用）：inline 复刻官方 ui-chat
 * stat-dialog.module.css 配方——官方样式表不在插件依赖面内，不引入自有设计。
 * 定位由调用方给（useCreditStatDialog 的 pos，量到真实尺寸后在视口内钳制）。
 */

import { Fragment } from 'react'
import type { CSSProperties, MutableRefObject } from 'react'
import { CodeBuddyMark } from './CodeBuddyMark.js'
import { formatCredits } from './format.js'

/** 官方 .panel（定位由 pos 覆盖）。 */
const panelStyle: CSSProperties = {
  position: 'fixed',
  zIndex: 1100,
  boxSizing: 'border-box',
  width: 'max-content',
  minWidth: 'min(260px, calc(100vw - 24px))',
  maxWidth: 'min(440px, calc(100vw - 24px))',
  padding: '16px',
  border: '0',
  borderRadius: '12px',
  background: 'var(--dsw-specific-menu)',
  // --dsw-specific-menu 是半透明玻璃色，须同规则配对 backdrop-filter，否则背后文字透出来
  backdropFilter: 'var(--dsw-menu-backdrop-filter)',
  '--dsw-elevation-stroke-color': 'var(--dsw-alias-border-l1)',
  boxShadow: 'var(--dsw-elevation-prominent)',
  fontSize: '12px',
  lineHeight: '18px',
  color: 'var(--dsw-alias-label-secondary)',
  cursor: 'default',
} as CSSProperties

/** 官方 .title。 */
const titleStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '16px',
  marginBottom: '8px',
  color: 'var(--dsw-alias-label-primary)',
  fontWeight: 500,
}

/** 官方 .titleLabel（标不随文字压缩）。 */
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

/** 官方 .details。 */
const detailsStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(76px, auto) minmax(0, 1fr)',
  gap: '6px 16px',
  margin: 0,
  color: 'var(--dsw-alias-label-tertiary)',
}

const termStyle: CSSProperties = { margin: 0, minWidth: 0 }

/** 「每次调用」分组小标题（横跨两列）。 */
const groupStyle: CSSProperties = { ...termStyle, gridColumn: '1 / -1', paddingTop: '4px' }

const valueStyle: CSSProperties = {
  margin: 0,
  minWidth: 0,
  color: 'var(--dsw-alias-label-secondary)',
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'right',
}

/** 长模型 id 可任意位置换行，不撑破面板。 */
const modelStyle: CSSProperties = { ...termStyle, overflowWrap: 'anywhere' }

export interface CreditDialogProps {
  /** 弹层本体（量尺寸 / 外点关闭判定用）。 */
  panelRef: MutableRefObject<HTMLDivElement | null>
  /** 定位坐标；首次测量前为 null（按 MEASURE_STYLE 不可见预排）。 */
  style: CSSProperties
  ariaLabel: string
  title: string
  credit: number
  callsLabel: string
  calls: number
  perCallLabel: string
  /** 按模型聚合（同模型多次调用合并一行）。 */
  byModel: ReadonlyArray<{ model: string; credit: number; calls: number }>
}

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
