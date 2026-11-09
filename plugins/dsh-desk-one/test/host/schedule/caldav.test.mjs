// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  discoverCalDav, listCalDavCalendars, queryCalDavEvents,
} from '../../../lib/host/schedule/caldav.js'
import { ScheduleError } from '../../../lib/host/schedule/types.js'

const AUTH = { user: 'alice@example.test', password: 'app-password' }
const WINDOW = { startUtc: '2026-11-01T00:00:00.000Z', endUtc: '2026-12-01T00:00:00.000Z' }
const EXPECTED_AUTHORIZATION = `Basic ${Buffer.from(`${AUTH.user}:${AUTH.password}`).toString('base64')}`

const multistatus = inner => `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${inner}</d:multistatus>`

const propstat = (props, status = 'HTTP/1.1 200 OK') => `<d:propstat><d:prop>${props}</d:prop><d:status>${status}</d:status></d:propstat>`

const davResponse = (href, ...propstats) => `<d:response><d:href>${href}</d:href>${propstats.join('')}</d:response>`

const xmlResponse = body => new Response(body, { status: 200, headers: { 'content-type': 'application/xml; charset=utf-8' } })

const redirect = location => new Response(null, { status: 301, headers: { location } })

/**
 * Fetch stub: records every call and lets each test answer by URL / method.
 * @returns {{ calls: Array<{ url: string, method: string, headers: Record<string, string>, body: string | undefined }>, fetchImpl: typeof fetch }}
 */
const fakeFetch = handler => {
  /** @type {any[]} */
  const calls = []
  const fetchImpl = async (input, init = {}) => {
    const url = String(input)
    const method = init.method ?? 'GET'
    const headers = /** @type {Record<string, string>} */ (init.headers ?? {})
    calls.push({ url, method, headers, body: init.body })
    return handler(url, method, headers, init)
  }
  return { calls, fetchImpl: /** @type {typeof fetch} */ (fetchImpl) }
}

const isScheduleError = kind => error => error instanceof ScheduleError && error.kind === kind

describe('discoverCalDav', () => {
  it('follows an iCloud shard redirect while keeping PROPFIND, then reads principal and home', async () => {
    const { calls, fetchImpl } = fakeFetch((url, method) => {
      if (url === 'https://caldav.icloud.com/.well-known/caldav') {
        return redirect('https://p01-caldav.icloud.com/.well-known/caldav')
      }
      if (url === 'https://p01-caldav.icloud.com/.well-known/caldav') {
        return xmlResponse(multistatus(davResponse(
          '/123/principal/',
          propstat('<d:current-user-principal><d:href>/123/principal/</d:href></d:current-user-principal>'),
        )))
      }
      if (url === 'https://p01-caldav.icloud.com/123/principal/') {
        assert.equal(method, 'PROPFIND')
        return xmlResponse(multistatus(davResponse(
          'https://p01-caldav.icloud.com/123/calendars/',
          propstat('<d:calendar-home-set><d:href>https://p01-caldav.icloud.com/123/calendars/</d:href></d:calendar-home-set>'),
        )))
      }
      throw new Error(`unexpected URL ${url}`)
    })

    const result = await discoverCalDav('https://caldav.icloud.com', AUTH, { fetchImpl })

    assert.deepEqual(result, {
      principalUrl: 'https://p01-caldav.icloud.com/123/principal/',
      homeUrl: 'https://p01-caldav.icloud.com/123/calendars/',
    })
    assert.equal(calls.length, 3)
    assert.equal(calls[0]?.method, 'PROPFIND')
    assert.equal(calls[0]?.headers.depth, '0')
    assert.equal(calls[0]?.headers.authorization, EXPECTED_AUTHORIZATION)
    assert.match(calls[0]?.body ?? '', /current-user-principal/)
    // The redirect must keep the WebDAV verb and body, otherwise servers answer with a GET page.
    assert.equal(calls[1]?.url, 'https://p01-caldav.icloud.com/.well-known/caldav')
    assert.equal(calls[1]?.method, 'PROPFIND')
    assert.equal(calls[1]?.body, calls[0]?.body)
  })

  it('derives the iCloud home from the principal when the home property is missing', async () => {
    const { fetchImpl } = fakeFetch((url) => {
      if (url === 'https://caldav.icloud.com/.well-known/caldav') {
        return xmlResponse(multistatus(davResponse(
          '/123/principal/',
          propstat('<d:current-user-principal><d:href>/123/principal/</d:href></d:current-user-principal>'),
        )))
      }
      if (url === 'https://caldav.icloud.com/123/principal/') {
        return xmlResponse(multistatus(davResponse('/123/principal/', propstat('<d:displayname>Principal</d:displayname>'))))
      }
      throw new Error(`unexpected URL ${url}`)
    })

    const result = await discoverCalDav('https://caldav.icloud.com', AUTH, { fetchImpl })
    assert.deepEqual(result, {
      principalUrl: 'https://caldav.icloud.com/123/principal/',
      homeUrl: 'https://caldav.icloud.com/123/calendars/',
    })
  })

  it('refuses to forward the credential to a non-approved redirect host', async () => {
    const { calls, fetchImpl } = fakeFetch(() => redirect('https://evil.example.test/.well-known/caldav'))
    await assert.rejects(
      discoverCalDav('https://caldav.icloud.com', AUTH, { fetchImpl }),
      isScheduleError('UNSUPPORTED'),
    )
    assert.equal(calls.length, 1)
  })

  it('maps 401 to AUTH_EXPIRED', async () => {
    const { fetchImpl } = fakeFetch(() => new Response(null, { status: 401 }))
    await assert.rejects(
      discoverCalDav('https://caldav.icloud.com', AUTH, { fetchImpl }),
      isScheduleError('AUTH_EXPIRED'),
    )
  })

  it('falls back to the origin when /.well-known/caldav is absent', async () => {
    const { calls, fetchImpl } = fakeFetch(url => {
      if (url === 'https://caldav.wecom.work/.well-known/caldav') return new Response(null, { status: 404 })
      if (url === 'https://caldav.wecom.work/') {
        return xmlResponse(multistatus(davResponse(
          '/cal/principal/',
          propstat('<d:current-user-principal><d:href>/cal/principal/</d:href></d:current-user-principal>'),
        )))
      }
      if (url === 'https://caldav.wecom.work/cal/principal/') {
        return xmlResponse(multistatus(davResponse(
          '/calendar/',
          propstat('<d:calendar-home-set><d:href>/calendar/</d:href></d:calendar-home-set>'),
        )))
      }
      throw new Error(`unexpected URL ${url}`)
    })

    const result = await discoverCalDav('https://caldav.wecom.work', AUTH, { fetchImpl })
    assert.equal(result.principalUrl, 'https://caldav.wecom.work/cal/principal/')
    assert.equal(result.homeUrl, 'https://caldav.wecom.work/calendar/')
    assert.equal(calls.length, 3)
    assert.match(calls[1]?.body ?? '', /current-user-principal/)
  })

  it('uses the documented /calendar/ home when WeCom discovery answers 404 everywhere', async () => {
    const { fetchImpl } = fakeFetch(() => new Response(null, { status: 404 }))
    const result = await discoverCalDav('https://caldav.wecom.work', AUTH, { fetchImpl })
    assert.deepEqual(result, {
      principalUrl: 'https://caldav.wecom.work/',
      homeUrl: 'https://caldav.wecom.work/calendar/',
    })
  })
})

describe('listCalDavCalendars', () => {
  it('keeps only calendar collections and returns absolute remote ids', async () => {
    const { calls, fetchImpl } = fakeFetch(url => {
      assert.equal(url, 'https://caldav.icloud.com/123/calendars/')
      return xmlResponse(multistatus([
        davResponse('/123/calendars/', propstat('<d:displayname>Home</d:displayname><d:resourcetype><d:collection/></d:resourcetype>')),
        davResponse('/123/calendars/work/', propstat('<d:displayname>Work</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype>')),
        davResponse('/123/calendars/personal/', propstat('<d:resourcetype><d:collection/><c:calendar/></d:resourcetype>')),
      ].join('')))
    })

    const calendars = await listCalDavCalendars('https://caldav.icloud.com/123/calendars/', AUTH, { fetchImpl })

    assert.deepEqual(calendars, [
      {
        provider: 'icloud',
        remoteId: 'https://caldav.icloud.com/123/calendars/work/',
        displayName: 'Work',
        order: 0,
      },
      {
        provider: 'icloud',
        remoteId: 'https://caldav.icloud.com/123/calendars/personal/',
        displayName: 'personal',
        order: 1,
      },
    ])
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.method, 'PROPFIND')
    assert.equal(calls[0]?.headers.depth, '1')
    assert.equal(calls[0]?.headers.authorization, EXPECTED_AUTHORIZATION)
    assert.match(calls[0]?.body ?? '', /resourcetype/)
  })

  it('infers the WeCom provider from the home host', async () => {
    const { fetchImpl } = fakeFetch(() => xmlResponse(multistatus(davResponse(
      '/calendar/work/',
      propstat('<d:displayname>公司</d:displayname><d:resourcetype><c:calendar/></d:resourcetype>'),
    ))))
    const calendars = await listCalDavCalendars('https://caldav.wecom.work/calendar/', AUTH, { fetchImpl })
    assert.equal(calendars[0]?.provider, 'wecom')
    assert.equal(calendars[0]?.remoteId, 'https://caldav.wecom.work/calendar/work/')
  })
})

describe('queryCalDavEvents', () => {
  it('sends a time-range REPORT and falls back to GET when calendar-data is missing', async () => {
    const { calls, fetchImpl } = fakeFetch((url, method) => {
      if (url === 'https://caldav.wecom.work/calendar/work/' && method === 'REPORT') {
        return xmlResponse(multistatus([
          davResponse('/calendar/work/event-a.ics', propstat(
            '<d:getetag>"a"</d:getetag><c:calendar-data>BEGIN:VCALENDAR&#13;&#10;UID:a&#13;&#10;END:VCALENDAR</c:calendar-data>',
          )),
          davResponse('/calendar/work/event-b.ics', propstat('<d:getetag>"b"</d:getetag>')),
          davResponse('/calendar/work/gone.ics', propstat('<d:getetag>"c"</d:getetag>')),
        ].join('')))
      }
      if (url === 'https://caldav.wecom.work/calendar/work/event-b.ics' && method === 'GET') {
        return new Response('BEGIN:VCALENDAR\nUID:b\nEND:VCALENDAR', {
          status: 200,
          headers: { 'content-type': 'text/calendar; charset=utf-8' },
        })
      }
      if (url === 'https://caldav.wecom.work/calendar/work/gone.ics' && method === 'GET') {
        return new Response(null, { status: 404 })
      }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const events = await queryCalDavEvents('https://caldav.wecom.work/calendar/work/', WINDOW, AUTH, { fetchImpl })

    assert.deepEqual(events.map(event => event.href), [
      'https://caldav.wecom.work/calendar/work/event-a.ics',
      'https://caldav.wecom.work/calendar/work/event-b.ics',
    ])
    assert.equal(events[0]?.etag, '"a"')
    assert.match(events[0]?.ics ?? '', /UID:a/)
    assert.equal(events[1]?.etag, '"b"')
    assert.match(events[1]?.ics ?? '', /UID:b/)

    const report = calls[0]
    assert.equal(report?.method, 'REPORT')
    assert.equal(report?.headers.depth, '1')
    assert.equal(report?.headers.authorization, EXPECTED_AUTHORIZATION)
    assert.match(report?.body ?? '', /<c:calendar-query/)
    // The bare calendar-data element is required: nested comp filters make iCloud return nothing.
    assert.match(report?.body ?? '', /<c:calendar-data\/>/)
    assert.match(report?.body ?? '', /start="20261101T000000Z"/)
    assert.match(report?.body ?? '', /end="20261201T000000Z"/)

    const getCalls = calls.filter(call => call.method === 'GET')
    assert.deepEqual(getCalls.map(call => call.url), [
      'https://caldav.wecom.work/calendar/work/event-b.ics',
      'https://caldav.wecom.work/calendar/work/gone.ics',
    ])
  })

  it('maps REPORT 401 to AUTH_EXPIRED', async () => {
    const { fetchImpl } = fakeFetch(() => new Response(null, { status: 401 }))
    await assert.rejects(
      queryCalDavEvents('https://caldav.icloud.com/123/calendars/work/', WINDOW, AUTH, { fetchImpl }),
      isScheduleError('AUTH_EXPIRED'),
    )
  })

  it('maps an HTML login page to AUTH_EXPIRED', async () => {
    const { fetchImpl } = fakeFetch(() => new Response('<!DOCTYPE html><html><body>Sign in</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }))
    await assert.rejects(
      queryCalDavEvents('https://caldav.icloud.com/123/calendars/work/', WINDOW, AUTH, { fetchImpl }),
      isScheduleError('AUTH_EXPIRED'),
    )
  })

  it('rejects empty credentials before any request', async () => {
    const { calls, fetchImpl } = fakeFetch(() => {
      throw new Error('must not be called')
    })
    await assert.rejects(
      queryCalDavEvents('https://caldav.icloud.com/123/calendars/work/', WINDOW, { user: '', password: '' }, { fetchImpl }),
      isScheduleError('AUTH_EXPIRED'),
    )
    assert.equal(calls.length, 0)
  })
})
