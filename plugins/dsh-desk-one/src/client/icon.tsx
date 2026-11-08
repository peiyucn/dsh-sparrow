/** 左栏「同桌」全局面板行的图标；按钮、行标题与选中态都由官方 sidebar 提供。 */

import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { DeskGlyph } from './brand.js'

/** 桌面 + agent 火花：和 harness 同桌，颜色走 currentColor。 */
export function DeskPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>): ReactNode {
  return <DeskGlyph size={size} />
}
