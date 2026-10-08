/**
 * 本插件统一的加载态：光秃秃一个官方转圈，不带可见文字——文案挂在容器
 * `aria-label` 上（读屏器仍会念）；颜色不覆盖，直接用官方 `.spinner` 的
 * `--dsw-alias-label-tertiary` 中性灰。
 */
import type { ReactElement } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'

export interface BusyDotProps {
  readonly label: string
  readonly style?: React.CSSProperties
}

export function BusyDot({ label, style }: BusyDotProps): ReactElement {
  return (
    <span
      role="status"
      aria-label={label}
      style={{ display: 'inline-flex', alignItems: 'center', ...style }}
    >
      <StateDot state="ongoing" />
    </span>
  )
}
