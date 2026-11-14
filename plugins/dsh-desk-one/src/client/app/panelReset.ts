/**
 * Cross-cutting "return to the entry tab" signal for pinned left-rail entries.
 *
 * The official sidebar rows and our main panels are wired by the official layout: clicking a row
 * selects its panel, and clicking the row of the **already active** panel only re-writes the same
 * `activePanelId` — the store suppresses the notification, so the panel cannot see the click. Its
 * own tab strip may meanwhile have drifted to another tab, which made a pinned shortcut look dead.
 *
 * The bridge: every pinned row's glyph carries {@link PANEL_TAB_ATTRIBUTE}; the client install
 * captures those clicks and publishes the row's tab here; the matching panel page subscribes and
 * resets its local tab to the tab the entry owns. Framework-free so node:test can drive it and
 * `install.ts` stays React-free.
 */

import type { Tab } from './types.js'

/** DOM marker carried by a pinned entry's left-rail glyph (one value per tab). */
export const PANEL_TAB_ATTRIBUTE = 'data-dsh-desk-panel-tab'

/** Receives the tab whose left-rail entry was clicked. */
export type PanelResetListener = (tab: Tab) => void

const listeners = new Set<PanelResetListener>()

/**
 * Subscribe to left-rail entry clicks.
 * @param listener - called with the clicked entry's tab.
 * @returns unsubscribe function (idempotent).
 */
export function subscribePanelReset(listener: PanelResetListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Publish one left-rail entry click to the mounted panels.
 * @param tab - the entry's own tab.
 */
export function requestPanelReset(tab: Tab): void {
  for (const listener of [...listeners]) listener(tab)
}
