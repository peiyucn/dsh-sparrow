/** Icon for the sidebar's "Desk One" panel row; the button, row title and selected state all come from the official sidebar. */

import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { DeskGlyph } from './brand.js'

/** Desk + agent spark: at the same desk as harness; color comes from currentColor. */
export function DeskPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>): ReactNode {
  return <DeskGlyph size={size} />
}
