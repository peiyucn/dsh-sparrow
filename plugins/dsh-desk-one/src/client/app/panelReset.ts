

import type { Tab } from './types.js'


export const PANEL_TAB_ATTRIBUTE = 'data-dsh-desk-panel-tab'


export type PanelResetListener = (tab: Tab) => void

const listeners = new Set<PanelResetListener>()


export function subscribePanelReset(listener: PanelResetListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}


export function requestPanelReset(tab: Tab): void {
  for (const listener of [...listeners]) listener(tab)
}
