/**
 * Left-rail icon per Desk One tab. The official sidebar renders one row per tab entry (the row
 * label/tooltip/active state all come from the official component); the icons only need to be
 * distinguishable at 16–18px and follow `currentColor`.
 */

import type { ComponentType, ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import {
  IconChecklistOutlineRegular,
  IconClockOutlineRegular,
  IconEditOutlineRegular,
  IconListPenOutlineRegular,
  IconNewChatOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { Tab } from './app/types.js'

type OfficialIcon = ComponentType<{ size?: number }>

/** Wrap an official icon as a sidebar-panellist slot component. */
function tabIcon(Base: OfficialIcon) {
  return function DeskTabIcon({ size }: PropsRuntime<'sidebar.panellist'>): ReactNode {
    return <Base size={size} />
  }
}

export const DESK_TAB_ICONS: Record<Tab, ReturnType<typeof tabIcon>> = {
  schedule: tabIcon(IconClockOutlineRegular),
  notebook: tabIcon(IconListPenOutlineRegular),
  notes: tabIcon(IconEditOutlineRegular),
  tasks: tabIcon(IconChecklistOutlineRegular),
  sessions: tabIcon(IconNewChatOutlineRegular),
}
