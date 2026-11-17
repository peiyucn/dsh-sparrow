

import { STYLE_SELECTOR } from '../constants.js'
import { APP_CSS } from './app/styles.js'
import { NOTES_CSS } from './notes/styles.js'
import { SCHEDULE_CSS } from './schedule/styles.js'
import { SESSIONS_CSS } from './sessions/styles.js'
import { NOTEBOOK_CSS } from './notebook/styles.js'
import { REVIEW_CSS } from './notebook/review-styles.js'
import { TASKS_CSS } from './tasks/styles.js'

const DESK_CSS = `${APP_CSS}\n${NOTES_CSS}\n${TASKS_CSS}\n${SCHEDULE_CSS}\n${SESSIONS_CSS}\n${NOTEBOOK_CSS}\n${REVIEW_CSS}`


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
