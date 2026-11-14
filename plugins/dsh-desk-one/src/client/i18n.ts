/**
 * Locale dictionaries for this plugin (zh / en), assembled from the per-feature fragments under
 * `./i18n/`. This file is the single source of truth for typed keys: `DeskLocaleKey` derives from
 * the zh dictionary, and `locale.d.ts` derives the typed namespace from that union — adding a key
 * is a one-file change. The zh / en key sets must correspond one-to-one (guarded by
 * test/structure/i18n.test.mjs).
 */
import { en as appEn, zh as appZh } from './i18n/app.js'
import { en as annotationEn, zh as annotationZh } from './i18n/annotation.js'
import { en as notebookEn, zh as notebookZh } from './i18n/notebook.js'
import { en as reviewEn, zh as reviewZh } from './i18n/review.js'
import { en as notesEn, zh as notesZh } from './i18n/notes.js'
import { en as actionEn, zh as actionZh } from './i18n/action.js'
import { en as tasksEn, zh as tasksZh } from './i18n/tasks.js'
import { en as scheduleEn, zh as scheduleZh } from './i18n/schedule.js'
import { en as sessionsEn, zh as sessionsZh } from './i18n/sessions.js'

const ZH = {
  ...appZh,
  ...annotationZh,
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
  ...annotationEn,
  ...notebookEn,
  ...reviewEn,
  ...notesEn,
  ...actionEn,
  ...tasksEn,
  ...scheduleEn,
  ...sessionsEn,
} as const

/** Every dictionary key; the typed locale namespace in `locale.d.ts` derives from this union. */
export type DeskLocaleKey = keyof typeof ZH

/** zh / en dictionaries, registered under LOCALE_NAMESPACE by the client entry. */
export const LOCALE_DICTS = { zh: ZH, en: EN } as const
