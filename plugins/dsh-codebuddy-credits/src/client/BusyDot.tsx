/**
 * 本插件统一的加载态：光秃秃一个官方转圈，不带可见文字——文案挂在容器
 * `aria-label` 上（读屏器仍会念）；颜色不覆盖，直接用官方 `.spinner` 的
 * `--dsw-alias-label-tertiary` 中性灰。布局在 styles.ts 的 `.ccb-busy-dot`。
 */
import type { ReactElement } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { CCB_CLASS } from './styles.js'

export interface BusyDotProps {
  readonly label: string
  /** 可选上下文样式类（如 `.ccb-caption` 的 12/18 正文档）。 */
  readonly className?: string
}

export function BusyDot({ label, className }: BusyDotProps): ReactElement {
  return (
    <span
      role="status"
      aria-label={label}
      className={className === undefined ? CCB_CLASS.busyDot : `${CCB_CLASS.busyDot} ${className}`}
    >
      <StateDot state="ongoing" />
    </span>
  )
}
