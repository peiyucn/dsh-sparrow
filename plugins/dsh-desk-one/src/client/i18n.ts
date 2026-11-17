
import { en as appEn, zh as appZh } from './i18n/app.js'
import { en as notebookEn, zh as notebookZh } from './i18n/notebook.js'
import { en as reviewEn, zh as reviewZh } from './i18n/review.js'
import { en as notesEn, zh as notesZh } from './i18n/notes.js'
import { en as actionEn, zh as actionZh } from './i18n/action.js'
import { en as tasksEn, zh as tasksZh } from './i18n/tasks.js'
import { en as scheduleEn, zh as scheduleZh } from './i18n/schedule.js'
import { en as sessionsEn, zh as sessionsZh } from './i18n/sessions.js'

const ZH = {
  ...appZh,
  ...notebookZh,
  ...reviewZh,
  ...notesZh,
  ...actionZh,
  ...tasksZh,
  ...scheduleZh,
  ...sessionsZh,
} as const

const EN = {
  ...appEn,
  ...notebookEn,
  ...reviewEn,
  ...notesEn,
  ...actionEn,
  ...tasksEn,
  ...scheduleEn,
  ...sessionsEn,
} as const


export type DeskLocaleKey = keyof typeof ZH


export const LOCALE_DICTS = { zh: ZH, en: EN } as const
