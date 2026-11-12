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

/** Chosen once per open: either a top edge (grows down) or a bottom edge (grows up), plus the cap. */
interface Placement {
  readonly left: number
  readonly top?: number
  readonly bottom?: number
  readonly maxHeight: number
}

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
  const [place, setPlace] = useState<Placement>()
  /**
   * Anchor the card once per open: growing content (the guest list) must not move it, otherwise the
   * card jumps away right after the user clicks "show". Growth is absorbed by an internal scroll
   * limited to the space available on the chosen side.
   */
  useLayoutEffect(() => {
    const node = cardRef.current
    if (node === null) return
    const width = DETAIL_CARD_WIDTH
    const height = node.getBoundingClientRect().height
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const anchorX = point === undefined ? viewportWidth - width - 24 : point.x
    const anchorY = point === undefined ? viewportHeight - height - 24 : point.y
    const left = Math.max(8, Math.min(anchorX + 14, viewportWidth - width - 8))
    const belowTop = anchorY + 14
    const fitsBelow = belowTop + height <= viewportHeight - 8
    const fitsAbove = anchorY - 14 - height >= 8
    if (fitsBelow || !fitsAbove) {
      // Open downwards; a clamped top only happens when the click is at the very bottom of a small
      // viewport, where there is no better side to pick.
      const top = Math.max(8, Math.min(belowTop, viewportHeight - 8 - height))
      setPlace({ left, top, maxHeight: viewportHeight - top - 8 })
      return
    }
    // Not enough room below: pin the bottom edge above the click point and let it grow upward.
    const bottom = Math.max(8, viewportHeight - (anchorY - 14))
    setPlace({ left, bottom, maxHeight: anchorY - 14 - 8 })
  }, [point, event.id])
  const style = place === undefined
    ? { width: `${DETAIL_CARD_WIDTH}px`, visibility: 'hidden' as const }
    : {
        width: `${DETAIL_CARD_WIDTH}px`,
        left: place.left,
        maxHeight: place.maxHeight,
        ...(place.top === undefined ? { bottom: place.bottom } : { top: place.top }),
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
              {peopleOpen ? (
                <p className="dsh-desk-schedule-people-list">
                  {event.attendees.map(label => (
                    <span key={label}>{label}</span>
                  ))}
                </p>
              ) : null}
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

