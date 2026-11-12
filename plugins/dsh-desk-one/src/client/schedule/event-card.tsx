/** Floating read-only event card, anchored near the click point. */

import { calendarColorOf, calendarNameOf, formatTime, startOfLocalDay } from './utils.js'
import { dayLabel, eventTitle, providerKey } from './shared.js'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ClickPoint } from './shared.js'
import type { DeskCalendar, DeskEvent, DeskScheduleSource } from '../../contract.js'
import type { DeskTranslator } from '../app/types.js'
import type { ReactElement } from 'react'

/** Card width used for viewport clamping (height is measured after render). */
const DETAIL_CARD_WIDTH = 360

/* -------------------------------- detail card -------------------------------- */

export function EventCard(props: {
  readonly t: DeskTranslator
  readonly event: DeskEvent
  readonly calendars: readonly DeskCalendar[]
  readonly sources: readonly DeskScheduleSource[]
  readonly point?: ClickPoint
  readonly onClose: () => void
}): ReactElement {
  const { t, event, calendars, sources, point } = props
  const cardRef = useRef<HTMLElement>(null)
  const [copied, setCopied] = useState(false)
  // Guest lists are long and unreadable at a glance: show the count and open on demand.
  const [peopleOpen, setPeopleOpen] = useState(false)
  const source = sources.find(item => item.provider === event.provider)
  const when = event.allDay
    ? `${dayLabel(t, startOfLocalDay(new Date(event.start)), new Date())} · ${t('schedule.allDay')}`
    : `${dayLabel(t, startOfLocalDay(new Date(event.start)), new Date())} ${formatTime(event.start)} – ${formatTime(event.end)}`
  const [place, setPlace] = useState<{ left: number; top: number }>()
  // The card height changes (guest list expands), so measure it and clamp/flip instead of assuming
  // a fixed height -- otherwise a card opened near the bottom edge is cut off.
  useLayoutEffect(() => {
    const node = cardRef.current
    if (node === null) return
    const width = DETAIL_CARD_WIDTH
    const height = node.getBoundingClientRect().height
    const anchorX = point === undefined ? window.innerWidth - width - 24 : point.x
    const anchorY = point === undefined ? window.innerHeight - height - 24 : point.y
    const below = point === undefined ? anchorY : anchorY + 14
    const above = anchorY - height - 14
    const top = below + height <= window.innerHeight - 8 || above < 8 ? below : above
    setPlace({
      left: Math.max(8, Math.min(anchorX + 14, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(top, window.innerHeight - height - 8)),
    })
  }, [point, peopleOpen, event.id])
  const style = {
    width: `${DETAIL_CARD_WIDTH}px`,
    ...(place === undefined ? { visibility: 'hidden' as const } : { left: place.left, top: place.top }),
  }

  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      if (cardRef.current !== null && !cardRef.current.contains(event.target as Node)) props.onClose()
    }
    const onKeyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape') props.onClose() }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [props])

  const copy = async (): Promise<void> => {
    const people = [
      event.organizer === undefined ? '' : `${t('schedule.detail.organizer')}：${event.organizer}`,
      event.attendees === undefined || event.attendees.length === 0 ? '' : `${t('schedule.detail.attendees')}：${event.attendees.join('、')}`,
    ].filter(value => value !== '').join('\n')
    const text = `${event.title}\n${when}\n${event.location ?? ''}${people === '' ? '' : `\n${people}`}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => { setCopied(false) }, 2000)
    } catch {
      setCopied(false)
    }
  }
  return (
    <aside ref={cardRef} className="dsh-desk-schedule-detail-card" style={style} aria-label={eventTitle(t, event)}>
      <header>
        <span className="dsh-desk-schedule-colorbar" style={{ background: calendarColorOf(event, calendars) }} />
        <h3 title={eventTitle(t, event)}>{eventTitle(t, event)}</h3>
        <button type="button" className="dsh-desk-schedule-icon" aria-label={t('schedule.detail.close')} onClick={props.onClose}>×</button>
      </header>
      <p className="dsh-desk-schedule-detail-source">
        {source === undefined ? calendarNameOf(event, calendars) : `${t(providerKey(source.provider) as never)} · ${source.account ?? ''} · ${calendarNameOf(event, calendars)}`}
      </p>
      <dl>
        <dt>{t('schedule.detail.when')}</dt><dd>{when}</dd>
        {event.location === undefined ? null : <><dt>{t('schedule.detail.location')}</dt><dd>{event.location}</dd></>}
        {event.organizer === undefined ? null : <><dt>{t('schedule.detail.organizer')}</dt><dd>{event.organizer}</dd></>}
        {event.attendees === undefined || event.attendees.length === 0 ? null : (
          <>
            <dt>{t('schedule.detail.attendees')}</dt>
            <dd className="dsh-desk-schedule-detail-people">
              <button
                type="button"
                className="dsh-desk-schedule-people-toggle"
                aria-expanded={peopleOpen}
                onClick={() => { setPeopleOpen(open => !open) }}
              >
                <span>{t('schedule.detail.attendeesCount', { count: event.attendees.length })}</span>
                <span className="dsh-desk-schedule-people-action">
                  {peopleOpen ? t('schedule.detail.attendeesHide') : t('schedule.detail.attendeesShow')}
                </span>
              </button>
              {peopleOpen ? <p>{event.attendees.join('、')}</p> : null}
            </dd>
          </>
        )}
        {event.description === undefined ? null : <><dt>{t('schedule.detail.description')}</dt><dd className="dsh-desk-schedule-detail-desc">{event.description}</dd></>}
      </dl>
      <footer>
        <span className="dsh-desk-schedule-readonly">{t('schedule.readOnly')}</span>
        <button type="button" className="dsh-desk-schedule-chip" onClick={() => { void copy() }}>{copied ? t('schedule.detail.copied') : t('schedule.detail.copy')}</button>
        {event.url === undefined ? null : (
          <a className="dsh-desk-schedule-chip" href={event.url} target="_blank" rel="noreferrer">{t('schedule.detail.open')}</a>
        )}
      </footer>
    </aside>
  )
}

