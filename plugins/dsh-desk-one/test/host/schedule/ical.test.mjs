// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseIcsEvents } from '../../../lib/host/schedule/ical.js'
import { ScheduleError } from '../../../lib/host/schedule/types.js'

const WINDOW = { startUtc: '2026-11-01T00:00:00.000Z', endUtc: '2026-12-01T00:00:00.000Z' }

/** WeCom sample: non-IANA TZID resolved through the embedded VTIMEZONE. */
const WECOM_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//dsh-desk-one//test//EN
CALSCALE:GREGORIAN
BEGIN:VTIMEZONE
TZID:Custom/WeCom
BEGIN:STANDARD
DTSTART:19700101T000000
TZOFFSETFROM:+0800
TZOFFSETTO:+0800
TZNAME:CST
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:simple@example.test
DTSTAMP:20261101T000000Z
DTSTART;TZID=Custom/WeCom:20261110T090000
DTEND;TZID=Custom/WeCom:20261110T093000
SUMMARY:Weekly sync
LOCATION:Room 3
TRANSP:OPAQUE
END:VEVENT
BEGIN:VEVENT
UID:transparent@example.test
DTSTAMP:20261101T000000Z
DTSTART;TZID=Custom/WeCom:20261110T110000
DTEND;TZID=Custom/WeCom:20261110T113000
SUMMARY:Optional coffee
TRANSP:TRANSPARENT
END:VEVENT
BEGIN:VEVENT
UID:allday@example.test
DTSTAMP:20261101T000000Z
DTSTART;VALUE=DATE:20261110
DTEND;VALUE=DATE:20261111
SUMMARY:Day off
END:VEVENT
BEGIN:VEVENT
UID:outside@example.test
DTSTAMP:20261101T000000Z
DTSTART;TZID=Custom/WeCom:20270101T090000
DTEND;TZID=Custom/WeCom:20270101T100000
SUMMARY:Next year
END:VEVENT
BEGIN:VEVENT
UID:weekly@example.test
DTSTAMP:20261101T000000Z
DTSTART;TZID=Custom/WeCom:20261102T100000
DTEND;TZID=Custom/WeCom:20261102T103000
RRULE:FREQ=WEEKLY;COUNT=6
EXDATE;TZID=Custom/WeCom:20261116T100000
SUMMARY:Standup
END:VEVENT
BEGIN:VEVENT
UID:weekly@example.test
RECURRENCE-ID;TZID=Custom/WeCom:20261109T100000
DTSTAMP:20261101T000000Z
DTSTART;TZID=Custom/WeCom:20261109T140000
DTEND;TZID=Custom/WeCom:20261109T150000
SUMMARY:Standup moved
LOCATION:Room 9
END:VEVENT
END:VCALENDAR
`

/** DTSTART 09:00 Europe/Berlin across the 2026 DST switch: UTC offset changes on Mar 29. */
const DST_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTIMEZONE
TZID:Europe/Berlin
BEGIN:STANDARD
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:dst@example.test
DTSTAMP:20260101T000000Z
DTSTART;TZID=Europe/Berlin:20260316T090000
DTEND;TZID=Europe/Berlin:20260316T093000
RRULE:FREQ=WEEKLY;COUNT=4
SUMMARY:DST series
END:VEVENT
END:VCALENDAR
`

const DST_WINDOW = { startUtc: '2026-03-01T00:00:00.000Z', endUtc: '2026-05-01T00:00:00.000Z' }

describe('parseIcsEvents: single, all-day and window filtering', () => {
  const events = parseIcsEvents(WECOM_ICS, { provider: 'wecom', calendarRemoteId: 'calendar-1', window: WINDOW })

  it('maps a timed event to UTC and keeps its original TZID', () => {
    const event = events.find(item => item.externalId === 'simple@example.test')
    assert.ok(event)
    assert.equal(event.startUtc, '2026-11-10T01:00:00.000Z')
    assert.equal(event.endUtc, '2026-11-10T01:30:00.000Z')
    assert.equal(event.allDay, false)
    assert.equal(event.timezone, 'Custom/WeCom')
    assert.equal(event.busy, true)
    assert.equal(event.title, 'Weekly sync')
    assert.equal(event.location, 'Room 3')
    assert.equal(event.recurrenceId, undefined)
    assert.equal(event.provider, 'wecom')
    assert.equal(event.calendarRemoteId, 'calendar-1')
  })

  it('maps an all-day event to midnight UTC of its date', () => {
    const event = events.find(item => item.externalId === 'allday@example.test')
    assert.ok(event)
    assert.equal(event.startUtc, '2026-11-10T00:00:00.000Z')
    assert.equal(event.endUtc, '2026-11-11T00:00:00.000Z')
    assert.equal(event.allDay, true)
    assert.equal(event.timezone, 'UTC')
    assert.equal(event.busy, true)
  })

  it('marks TRANSP:TRANSPARENT events as not busy', () => {
    const event = events.find(item => item.externalId === 'transparent@example.test')
    assert.ok(event)
    assert.equal(event.busy, false)
  })

  it('drops events outside the pull window', () => {
    assert.equal(events.some(item => item.externalId === 'outside@example.test'), false)
  })
})

describe('parseIcsEvents: recurrence expansion', () => {
  const events = parseIcsEvents(WECOM_ICS, { provider: 'wecom', calendarRemoteId: 'calendar-1', window: WINDOW })
  const weekly = events.filter(item => item.uid === 'weekly@example.test')

  it('expands instances inside the window and honours EXDATE', () => {
    assert.deepEqual(weekly.map(item => item.externalId), [
      'weekly@example.test#20261102T020000Z',
      'weekly@example.test#20261109T020000Z',
      'weekly@example.test#20261123T020000Z',
      'weekly@example.test#20261130T020000Z',
    ])
    // 2026-11-16 is EXDATE'd; 2026-12-07 (last COUNT instance) is outside the window.
    assert.equal(weekly.some(item => item.externalId.includes('20261116')), false)
  })

  it('uses the override time and fields instead of the master occurrence', () => {
    const moved = weekly.find(item => item.externalId === 'weekly@example.test#20261109T020000Z')
    assert.ok(moved)
    assert.equal(moved.startUtc, '2026-11-09T06:00:00.000Z')
    assert.equal(moved.endUtc, '2026-11-09T07:00:00.000Z')
    assert.equal(moved.title, 'Standup moved')
    assert.equal(moved.location, 'Room 9')
    assert.equal(moved.recurrenceId, '20261109T020000Z')
  })

  it('keeps the master RRULE text on every instance', () => {
    assert.ok(weekly.length > 0)
    for (const instance of weekly) {
      assert.equal(instance.rrule, 'RRULE:FREQ=WEEKLY;COUNT=6')
    }
  })

  it('narrows to the single instance inside a one-day window', () => {
    const narrow = parseIcsEvents(WECOM_ICS, {
      provider: 'wecom',
      calendarRemoteId: 'calendar-1',
      window: { startUtc: '2026-11-09T00:00:00.000Z', endUtc: '2026-11-10T00:00:00.000Z' },
    })
    assert.deepEqual(narrow.map(item => item.externalId), ['weekly@example.test#20261109T020000Z'])
  })

  it('sorts by startUtc then externalId and never duplicates an instance', () => {
    const ids = events.map(item => item.externalId)
    assert.equal(new Set(ids).size, ids.length)
    assert.equal(events.length, 7)
    const sorted = [...events].sort((left, right) =>
      left.startUtc.localeCompare(right.startUtc) || left.externalId.localeCompare(right.externalId))
    assert.deepEqual(events.map(item => item.externalId), sorted.map(item => item.externalId))
  })

  it('applies DST transitions from the embedded VTIMEZONE', () => {
    const dst = parseIcsEvents(DST_ICS, { provider: 'icloud', calendarRemoteId: 'cal', window: DST_WINDOW })
    assert.deepEqual(dst.map(item => item.startUtc), [
      '2026-03-16T08:00:00.000Z',
      '2026-03-23T08:00:00.000Z',
      '2026-03-30T07:00:00.000Z',
      '2026-04-06T07:00:00.000Z',
    ])
    assert.equal(dst[0]?.timezone, 'Europe/Berlin')
  })
})

describe('parseIcsEvents: defensive behaviour', () => {
  it('skips a series whose master is CANCELLED and instances whose override is CANCELLED', () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:cancelled-series@example.test
DTSTAMP:20260101T000000Z
DTSTART:20261102T100000Z
DTEND:20261102T103000Z
RRULE:FREQ=WEEKLY;COUNT=2
STATUS:CANCELLED
SUMMARY:Do not show
END:VEVENT
BEGIN:VEVENT
UID:partial@example.test
DTSTAMP:20260101T000000Z
DTSTART:20261102T100000Z
DTEND:20261102T103000Z
RRULE:FREQ=WEEKLY;COUNT=2
SUMMARY:Keep first
END:VEVENT
BEGIN:VEVENT
UID:partial@example.test
RECURRENCE-ID:20261109T100000Z
DTSTAMP:20260101T000000Z
DTSTART:20261109T100000Z
DTEND:20261109T103000Z
STATUS:CANCELLED
SUMMARY:Cancelled second
END:VEVENT
END:VCALENDAR`
    const events = parseIcsEvents(ics, { provider: 'outlook', calendarRemoteId: 'ics', window: WINDOW })
    assert.deepEqual(events.map(item => item.externalId), ['partial@example.test#20261102T100000Z'])
  })

  it('treats a TZID without VTIMEZONE deterministically as UTC wall clock', () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:no-zone@example.test
DTSTAMP:20260101T000000Z
DTSTART;TZID=Asia/Shanghai:20261110T090000
DTEND;TZID=Asia/Shanghai:20261110T100000
SUMMARY:No VTIMEZONE
END:VEVENT
END:VCALENDAR`
    const [event] = parseIcsEvents(ics, { provider: 'wecom', calendarRemoteId: 'cal', window: WINDOW })
    assert.ok(event)
    assert.equal(event.startUtc, '2026-11-10T09:00:00.000Z')
    assert.equal(event.timezone, 'UTC')
  })

  it('returns [] for empty input and throws ScheduleError(UNSUPPORTED) for broken input', () => {
    assert.deepEqual(parseIcsEvents('', { provider: 'wecom', calendarRemoteId: 'cal', window: WINDOW }), [])
    assert.throws(
      () => parseIcsEvents('BEGIN:VCALENDAR\nthis is not an iCalendar body', { provider: 'wecom', calendarRemoteId: 'cal', window: WINDOW }),
      error => error instanceof ScheduleError && error.kind === 'UNSUPPORTED',
    )
  })

  it('rejects a window whose end is not after its start', () => {
    assert.throws(
      () => parseIcsEvents(WECOM_ICS, {
        provider: 'wecom',
        calendarRemoteId: 'cal',
        window: { startUtc: '2026-12-01T00:00:00.000Z', endUtc: '2026-11-01T00:00:00.000Z' },
      }),
      error => error instanceof ScheduleError && error.kind === 'UNSUPPORTED',
    )
  })
})
