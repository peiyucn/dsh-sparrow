/** 左栏「桌面」全局面板行的图标；按钮、行标题与选中态都由官方 sidebar 提供。 */

import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/** 四格「工作台」字形，颜色走 currentColor（选中态由官方行负责）。 */
export function DeskPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="4.5" width="7" height="6.5" rx="1.6" stroke="currentColor" strokeWidth="1.5" />
      <rect x="13.5" y="4.5" width="7" height="6.5" rx="1.6" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3.5" y="14" width="7" height="5.5" rx="1.6" stroke="currentColor" strokeWidth="1.5" />
      <rect x="13.5" y="14" width="7" height="5.5" rx="1.6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}
