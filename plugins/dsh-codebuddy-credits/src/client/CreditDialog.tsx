/**
 * 积分弹层皮肤（每轮 / 会话积分胶囊共用）：复刻官方 ui-chat
 * stat-dialog.module.css 配方——官方样式表不在插件依赖面内，不引入自有设计。
 * 静态皮肤在 styles.ts（`.ccb-credit-dialog*`）；定位由调用方给
 * （useCreditStatDialog 的 pos，量到真实尺寸后在视口内钳制），是这里唯一的 inline style。
 */

import { Fragment } from 'react'
import type { CSSProperties, MutableRefObject } from 'react'
import { CodeBuddyMark } from './CodeBuddyMark.js'
import { formatCredits } from './format.js'
import { CCB_CLASS } from './styles.js'

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
    <div ref={panelRef} role="dialog" aria-label={ariaLabel} className={CCB_CLASS.dialog} style={style}>
      <div className={CCB_CLASS.dialogTitle}>
        <span className={CCB_CLASS.dialogTitleLabel}>
          <CodeBuddyMark size={14} />
          {title}
        </span>
        <span className={CCB_CLASS.dialogAmount}>{formatCredits(credit)}</span>
      </div>
      <div className={CCB_CLASS.dialogRule} aria-hidden />
      <dl className={CCB_CLASS.dialogDetails}>
        <dt className={CCB_CLASS.dialogTerm}>{callsLabel}</dt>
        <dd className={CCB_CLASS.dialogValue}>{String(calls)}</dd>
        {byModel.length > 0
          ? (
            <>
              <dt className={CCB_CLASS.dialogGroup}>{perCallLabel}</dt>
              {byModel.map((call, index) => (
                <Fragment key={index}>
                  <dt className={CCB_CLASS.dialogModel}>
                    {call.model}{call.calls > 1 ? ` ×${call.calls}` : ''}
                  </dt>
                  <dd className={CCB_CLASS.dialogValue}>{formatCredits(call.credit)}</dd>
                </Fragment>
              ))}
            </>
          )
          : null}
      </dl>
    </div>
  )
}
