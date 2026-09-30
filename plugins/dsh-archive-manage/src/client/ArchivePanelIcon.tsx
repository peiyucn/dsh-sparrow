/** 左栏「归档」全局面板行的图标；按钮、行标题与选中态都由官方 sidebar 提供（官方插件同款）。 */

import type { ReactNode } from 'react'
import { IconArchiveOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * 按官方 sidebar 请求的边长渲染归档字形（颜色走 currentColor，选中态由官方行负责）。
 * @param props - 官方行的图标份额：请求边长与「本面板是否选中」。
 * @returns 图标元素。
 */
export function ArchivePanelIcon({ size }: PropsRuntime<'sidebar.panellist'>): ReactNode {
  return <IconArchiveOutlineRegular size={size} />
}
