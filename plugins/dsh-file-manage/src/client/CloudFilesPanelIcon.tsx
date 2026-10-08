/** 左栏「云端文件」全局面板行的图标；按钮、行标题与选中态都由官方 sidebar 提供（官方插件同款）。 */

import type { ReactNode } from 'react'
import { IconFolderOpenOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/** 按官方 sidebar 请求的边长渲染文件夹字形（颜色走 currentColor，选中态由官方行负责）。 */
export function CloudFilesPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>): ReactNode {
  return <IconFolderOpenOutlineRegular size={size} />
}
