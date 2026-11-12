/**
 * Shared schedule helpers: the pieces every schedule view needs (title fallback, day labels,
 * provider keys, weekend test). Kept separate so the panel modules stay readable.
 */

import { formatDateLabel, formatDayTitle, weekdayLabel, weekdayLabels } from './utils.js'
import type { DeskEvent } from '../../contract.js'
import type { DeskTranslator } from '../app/types.js'
import type { ScheduleProvider } from '../../constants.js'

export const PROVIDER_ORDER: readonly ScheduleProvider[] = ['wecom', 'icloud']
/**
 * Readable form of an organizer/attendee label. Sources often export only a mail address
 * (WeCom omits ATTENDEE CN), so the domain is dropped and a leading employee-id prefix such as
 * `dj014024luwei` is removed. Display only -- the stored value stays the full address.
 */
export function personDisplayName(label: string): string {
  const at = label.indexOf('@')
  if (at < 0) return label
  const local = label.slice(0, at)
  const named = /^[a-z]{2}\d{6,8}([a-z].*)$/u.exec(local)
  const name = named?.[1]
  return name === undefined || name === '' ? local : name
}

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

