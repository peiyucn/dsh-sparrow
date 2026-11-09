// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { queryCalDavEvents } from '../../../lib/host/schedule/caldav.js'
import { ScheduleError } from '../../../lib/host/schedule/types.js'

const AUTH = { user: 'alice@example.test', password: 'app-password' }
const WINDOW = { startUtc: '2026-11-01T00:00:00.000Z', endUtc: '2026-12-01T00:00:00.000Z' }
const CALENDAR_URL = 'https://caldav.wecom.work/calendar/abc/'
const EVENT_URL = 'https://caldav.wecom.work/calendar/abc/event-1.ics'
const ICS = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:e1\r\nDTSTART:20261109T010000Z\r\nEND:VEVENT\r\nEND:VCALENDAR'

const xml = (body) => new Response(body, { status: 200, headers: { 'content-type': 'application/xml; charset=utf-8' } })
const ics = () => new Response(ICS, { status: 200, headers: { 'content-type': 'text/calendar' } })

const multistatusOpen = '<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">'
const multistatusClose = '</d:multistatus>'
const responseOf = (href, props) => `<d:response><d:href>${href}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`

const fakeFetch = (handler) => {
  /** @type {any[]} */
  const calls = []
  const fetchImpl = async (input, init = {}) => {
    const url = String(input)
    const method = init.method ?? 'GET'
    const headers = /** @type {Record<string, string>} */ (init.headers ?? {})
    calls.push({ url, method, headers, body: init.body })
    return handler(url, method, headers)
  }
  return { calls, fetchImpl: /** @type {typeof fetch} */ (fetchImpl) }
}

describe('queryCalDavEvents · WeCom self-entry handling', () => {
  it('skips the collection self-entry (no ETag) and GETs only real objects', async () => {
    const { calls, fetchImpl } = fakeFetch((url, method) => {
      if (method === 'REPORT') {
        return xml(multistatusOpen
          + responseOf('/calendar/abc/', '<d:resourcetype><d:collection/></d:resourcetype>')
          + responseOf('/calendar/abc/event-1.ics', '<d:getetag>"e1"</d:getetag>')
          + multistatusClose)
      }
      if (url === EVENT_URL) return ics()
      throw new Error(`unexpected URL ${url}`)
    })

    const result = await queryCalDavEvents(CALENDAR_URL, WINDOW, AUTH, { fetchImpl })

    assert.equal(result.length, 1)
    assert.equal(result[0]?.ics, ICS)
    assert.equal(result[0]?.etag, '"e1"')
    assert.deepEqual(calls.map(call => [call.method, call.url]), [
      ['REPORT', CALENDAR_URL],
      ['GET', EVENT_URL],
    ])
    assert.match(calls[1]?.headers.authorization ?? '', /^Basic /u, 'GET also carries Basic auth')
  })

  it('still fails loudly when a real object GET is unauthorized', async () => {
    const { fetchImpl } = fakeFetch((_url, method) => {
      if (method === 'REPORT') {
        return xml(multistatusOpen
          + responseOf('/calendar/abc/event-1.ics', '<d:getetag>"e1"</d:getetag>')
          + multistatusClose)
      }
      return new Response('denied', { status: 403 })
    })

    await assert.rejects(
      queryCalDavEvents(CALENDAR_URL, WINDOW, AUTH, { fetchImpl }),
      (error) => error instanceof ScheduleError && error.kind === 'AUTH_EXPIRED',
    )
  })
})
