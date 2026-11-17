

import { calendarColorOf, calendarNameOf, formatClock24h, startOfLocalDay } from './utils.js'
import { dayLabel, eventTitle, providerKey } from './shared.js'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ActionTooltip } from '../app/ActionTooltip.js'
import { useCopyFeedback } from '../app/useCopyFeedback.js'
import type { ClickPoint } from './shared.js'
import type { DeskCalendar, DeskEvent, DeskScheduleSource } from '../../contract.js'
import type { DeskTranslator } from '../app/types.js'
import type { ReactElement } from 'react'


const DETAIL_CARD_WIDTH = 360

const COPY_FEEDBACK_MS = 2_000


interface Placement {
  readonly left: number
  readonly top?: number
  readonly bottom?: number
  readonly maxHeight: number
}



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

  const onCloseRef = useRef(props.onClose)
  onCloseRef.current = props.onClose
  const copyFeedback = useCopyFeedback({ feedbackMs: COPY_FEEDBACK_MS })

  const [peopleOpen, setPeopleOpen] = useState(false)
  const source = sources.find(item => item.provider === event.provider)
  const when = event.allDay
    ? `${dayLabel(t, startOfLocalDay(new Date(event.start)), new Date())} · ${t('schedule.allDay')}`
    : `${dayLabel(t, startOfLocalDay(new Date(event.start)), new Date())} ${formatClock24h(event.start)} – ${formatClock24h(event.end)}`
  const [place, setPlace] = useState<Placement>()

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


      const top = Math.max(8, Math.min(belowTop, viewportHeight - 8 - height))
      setPlace({ left, top, maxHeight: viewportHeight - top - 8 })
      return
    }

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
      if (cardRef.current !== null && !cardRef.current.contains(event.target as Node)) onCloseRef.current()
    }
    const onKeyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape') onCloseRef.current() }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const copy = (): void => {
    const people = [
      event.organizer === undefined ? '' : `${t('schedule.detail.organizer')}：${event.organizer}`,
      event.attendees === undefined || event.attendees.length === 0 ? '' : `${t('schedule.detail.attendees')}：${event.attendees.join('、')}`,
    ].filter(value => value !== '').join('\n')
    const text = `${event.title}\n${when}\n${event.location ?? ''}${people === '' ? '' : `\n${people}`}`
    void copyFeedback.copy(text)
  }
  return (
    <aside ref={cardRef} className="dsh-desk-schedule-detail-card" style={style} aria-label={eventTitle(t, event)}>
      <header>
        <span className="dsh-desk-schedule-colorbar" style={{ background: calendarColorOf(event, calendars) }} />
        <h3 title={eventTitle(t, event)}>{eventTitle(t, event)}</h3>
        <ActionTooltip label={t('schedule.detail.close')}>
          <button type="button" className="dsh-desk-schedule-icon" aria-label={t('schedule.detail.close')} onClick={props.onClose}>×</button>
        </ActionTooltip>
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
        <button type="button" className="dsh-desk-schedule-chip" onClick={copy}>{copyFeedback.state === 'copied' ? t('schedule.detail.copied') : t('schedule.detail.copy')}</button>
        {event.url === undefined ? null : (
          <a className="dsh-desk-schedule-chip" href={event.url} target="_blank" rel="noreferrer">{t('schedule.detail.open')}</a>
        )}
      </footer>
    </aside>
  )
}
