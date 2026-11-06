/**
 * Aggregated stylesheet text injected by the client half. Split by feature so node:test can
 * assert each feature's CSS without loading React; keep style tokens in one place per feature.
 */

import { STYLE_SELECTOR } from '../constants.js'
import { APP_CSS } from './app/styles.js'
import { NOTES_CSS } from './notes/styles.js'

const DESK_CSS = `${APP_CSS}\n${NOTES_CSS}`

/** Inject the stylesheet and return the style element; the caller removes it on unload. HMR reuses it. */
export function ensureDeskStyles(): HTMLStyleElement {
  const existing = document.querySelector<HTMLStyleElement>(STYLE_SELECTOR)
  if (existing !== null) {
    existing.textContent = DESK_CSS
    return existing
  }
  const style = document.createElement('style')
  style.setAttribute('data-dsh-desk-one', '')
  style.textContent = DESK_CSS
  document.head.appendChild(style)
  return style
}

/** For node:test: the aggregated stylesheet as text. */
export const DESK_STYLESHEET = DESK_CSS
