

import type { ComponentType, ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import {
  IconChecklistOutlineRegular,
  IconEditOutlineRegular,
  IconListPenOutlineRegular,
  IconQueueOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { Tab } from './app/types.js'
import { PANEL_TAB_ATTRIBUTE } from './app/panelReset.js'
import { DeskGlyph } from './brand.js'


type OfficialIcon = ComponentType<{ size?: number }>


function ScheduleGlyph({ size = 14 }: { readonly size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 3.5v4M16 3.5v4M4 10h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8.5 13.5h.01M12 13.5h.01M15.5 13.5h.01M8.5 16.5h.01M12 16.5h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

const GLYPHS: Record<Tab, OfficialIcon> = {
  schedule: ScheduleGlyph,
  notebook: IconListPenOutlineRegular,
  notes: IconEditOutlineRegular,
  tasks: IconChecklistOutlineRegular,


  sessions: IconQueueOutlineRegular,
}


export function DeskTabGlyph({ tab, size = 14 }: { readonly tab: Tab; readonly size?: number }): ReactNode {
  const Icon = GLYPHS[tab]
  return <Icon size={size} />
}


export function DeskBaseIcon({ size }: PropsRuntime<'sidebar.panellist'>): ReactNode {
  return <DeskGlyph size={size} />
}


function panellistIcon(tab: Tab) {
  return function DeskTabPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>): ReactNode {
    return (
      <span {...{ [PANEL_TAB_ATTRIBUTE]: tab }} style={{ display: 'inline-flex' }}>
        <DeskTabGlyph tab={tab} size={size} />
      </span>
    )
  }
}


export const DESK_TAB_ICONS: Record<Tab, ReturnType<typeof panellistIcon>> = {
  schedule: panellistIcon('schedule'),
  notebook: panellistIcon('notebook'),
  notes: panellistIcon('notes'),
  tasks: panellistIcon('tasks'),
  sessions: panellistIcon('sessions'),
}
