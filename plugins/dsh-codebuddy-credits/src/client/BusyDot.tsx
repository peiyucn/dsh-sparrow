
import type { ReactElement } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { CCB_CLASS } from './styles.js'

export interface BusyDotProps {
  readonly label: string

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
