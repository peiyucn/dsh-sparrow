

import type { ReactElement } from 'react'
import { Tooltip, type TooltipSide } from '@deepseek-ai/dsh-client-ui-primitives'


const TOOLTIP_DELAY_MS = 400

export function ActionTooltip({ label, side = 'bottom', children }: {
  readonly label: string
  readonly side?: TooltipSide
  readonly children: ReactElement
}): ReactElement {
  return (
    <Tooltip label={label} side={side} delayMs={TOOLTIP_DELAY_MS} portal>
      {children}
    </Tooltip>
  )
}
