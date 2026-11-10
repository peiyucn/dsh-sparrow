/**
 * Shared schedule helpers: the pieces every schedule view needs (title fallback, day labels,
 * provider keys, weekend test). Kept separate so the panel modules stay readable.
 */

import { formatDateLabel, formatDayTitle, weekdayLabel, weekdayLabels } from './utils.js'
import type { DeskEvent } from '../../contract.js'
import type { DeskTranslator } from '../app/types.js'
import type { ScheduleProvider } from '../../constants.js'

export const PROVIDER_ORDER: readonly ScheduleProvider[] = ['wecom', 'icloud']
export function providerKey(provider: ScheduleProvider): string {
  return `schedule.provider.${provider}`
}

export function eventTitle(t: DeskTranslator, event: DeskEvent): string {
  return event.title === '' ? t('schedule.untitled') : event.title
}

export function dayLabel(t: DeskTranslator, date: Date, today: Date): string {
  return formatDayTitle(date, today, { today: t('schedule.day.today'), tomorrow: t('schedule.day.tomorrow') },
    value => `${weekdayLabel(value, weekdayLabels(t('schedule.weekdays'))) } ${formatDateLabel(value, t)}`)
}

export interface ClickPoint {
  readonly x: number
  readonly y: number
}

