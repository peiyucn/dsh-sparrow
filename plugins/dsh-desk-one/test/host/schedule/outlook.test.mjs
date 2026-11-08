// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fetchOutlookIcs } from '../../../lib/host/schedule/providers/outlook-ics.js'
import { ScheduleError } from '../../../lib/host/schedule/types.js'

const ICS = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:holiday@example.test\r\nEND:VEVENT\r\nEND:VCALENDAR'
const ICS_URL = 'https://outlook.office365.com/owa/calendar/published/calendar.ics'

const fakeFetch = handler => {
  /** @type {any[]} */
  const calls = []
  const fetchImpl = async (input, init = {}) => {
    const url = String(input)
    const headers = /** @type {Record<string, string>} */ (init.headers ?? {})
    calls.push({ url, method: init.method ?? 'GET', headers })
    return handler(url, headers)
  }
  return { calls, fetchImpl: /** @type {typeof fetch} */ (fetchImpl) }
}

const isScheduleError = kind => error => error instanceof ScheduleError && error.kind === kind

describe('fetchOutlookIcs', () => {
  it('fetches an ICS body and returns its ETag', async () => {
    const { calls, fetchImpl } = fakeFetch(() => new Response(ICS, {
      status: 200,
      headers: { 'content-type': 'text/calendar; charset=utf-8', etag: '"published-v1"' },
    }))

    const result = await fetchOutlookIcs(ICS_URL, { fetchImpl })

    assert.equal(result.notModified, false)
    assert.equal('ics' in result ? result.ics : undefined, ICS)
    assert.equal(result.etag, '"published-v1"')
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.url, ICS_URL)
    assert.equal(calls[0]?.method, 'GET')
    assert.equal(calls[0]?.headers['if-none-match'], undefined)
  })

  it('sends If-None-Match and reports notModified on 304', async () => {
    const { calls, fetchImpl } = fakeFetch(() => new Response(null, { status: 304 }))

    const result = await fetchOutlookIcs(ICS_URL, { etag: '"published-v1"', fetchImpl })

    assert.deepEqual(result, { notModified: true, ics: undefined, etag: '"published-v1"' })
    assert.equal(calls[0]?.headers['if-none-match'], '"published-v1"')
  })

  it('treats an HTML login page as AUTH_EXPIRED instead of parsing it', async () => {
    const { fetchImpl } = fakeFetch(() => new Response('<!DOCTYPE html><html><body>Sign in</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    }))
    await assert.rejects(fetchOutlookIcs(ICS_URL, { fetchImpl }), isScheduleError('AUTH_EXPIRED'))
  })

  it('maps disabled-link statuses to AUTH_EXPIRED and 5xx to TRANSIENT', async () => {
    for (const status of [401, 403, 404, 410]) {
      const { fetchImpl } = fakeFetch(() => new Response(null, { status }))
      await assert.rejects(fetchOutlookIcs(ICS_URL, { fetchImpl }), isScheduleError('AUTH_EXPIRED'))
    }
    for (const status of [429, 500, 503]) {
      const { fetchImpl } = fakeFetch(() => new Response(null, { status }))
      await assert.rejects(fetchOutlookIcs(ICS_URL, { fetchImpl }), isScheduleError('TRANSIENT'))
    }
  })

  it('rejects non-whitelisted hosts, http and embedded credentials without any request', async () => {
    const { calls, fetchImpl } = fakeFetch(() => {
      throw new Error('must not be called')
    })
    await assert.rejects(fetchOutlookIcs('https://example.test/calendar.ics', { fetchImpl }), isScheduleError('UNSUPPORTED'))
    await assert.rejects(fetchOutlookIcs('http://outlook.live.com/calendar.ics', { fetchImpl }), isScheduleError('UNSUPPORTED'))
    await assert.rejects(fetchOutlookIcs('https://outlook.live.com:pass@example.test/x.ics', { fetchImpl }), isScheduleError('UNSUPPORTED'))
    assert.equal(calls.length, 0)
  })

  it('accepts the documented Outlook hosts', async () => {
    for (const url of [
      'https://outlook.live.com/calendar.ics',
      'https://outlook.office.com/calendar.ics',
      'https://outlook.office365.com/calendar.ics',
      'https://calendar.outlook.com/calendar.ics',
    ]) {
      const { fetchImpl } = fakeFetch(() => new Response(ICS, { status: 200, headers: { 'content-type': 'text/calendar' } }))
      const result = await fetchOutlookIcs(url, { fetchImpl })
      assert.equal('ics' in result ? result.ics : undefined, ICS, url)
    }
  })

  it('rejects a 200 response that is not iCalendar', async () => {
    const { fetchImpl } = fakeFetch(() => new Response('just some text', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    }))
    await assert.rejects(fetchOutlookIcs(ICS_URL, { fetchImpl }), isScheduleError('UNSUPPORTED'))
  })

  it('strips a UTF-8 BOM before returning the body', async () => {
    const { fetchImpl } = fakeFetch(() => new Response(`\uFEFF${ICS}`, {
      status: 200,
      headers: { 'content-type': 'text/calendar' },
    }))
    const result = await fetchOutlookIcs(ICS_URL, { fetchImpl })
    assert.ok(('ics' in result ? result.ics : undefined)?.startsWith('BEGIN:VCALENDAR'))
  })

  it('maps a network failure to TRANSIENT', async () => {
    const { fetchImpl } = fakeFetch(() => {
      throw new Error('fetch failed')
    })
    await assert.rejects(fetchOutlookIcs(ICS_URL, { fetchImpl }), isScheduleError('TRANSIENT'))
  })
})
