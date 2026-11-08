// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseMultistatus } from '../../../lib/host/schedule/xml.js'

/** WeCom-shaped multistatus: uppercase prefixes, relative hrefs, no response-level status. */
const WECOM_MULTISTATUS = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/calendar/</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>公司日历</D:displayname>
        <D:resourcetype><D:collection/><C:calendar/></D:resourcetype>
        <D:sync-token>http://example.test/ns/sync/42</D:sync-token>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/calendar/project%20a/</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>Project &amp; Ops</D:displayname>
        <D:resourcetype><D:collection/><C:calendar/></D:resourcetype>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`

/** iCloud-shaped multistatus: lowercase prefixes, absolute paths, 404 propstat, calendar-data. */
const ICLOUD_MULTISTATUS = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:href>/123/principal/</d:href>
    <d:propstat>
      <d:prop>
        <d:current-user-principal><d:href>/123/principal/</d:href></d:current-user-principal>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>https://p01-caldav.icloud.com/123/calendars/</d:href>
    <d:propstat>
      <d:prop>
        <d:calendar-home-set><d:href>https://p01-caldav.icloud.com/123/calendars/</d:href></d:calendar-home-set>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/123/calendars/work/</d:href>
    <d:propstat>
      <d:prop>
        <d:displayname>Work &amp; Travel</d:displayname>
        <d:resourcetype><d:collection/><c:calendar/></d:resourcetype>
        <d:getetag>"calendar-etag"</d:getetag>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
    <d:propstat>
      <d:prop><d:calendar-data/></d:prop>
      <d:status>HTTP/1.1 404 Not Found</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/123/calendars/work/event%201.ics</d:href>
    <d:propstat>
      <d:prop>
        <d:getetag>"event-etag"</d:getetag>
        <c:calendar-data>BEGIN:VCALENDAR&#13;&#10;VERSION:2.0&#13;&#10;SUMMARY:a &lt; b&#13;&#10;END:VCALENDAR</c:calendar-data>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/123/calendars/work/no-data.ics</d:href>
    <d:propstat>
      <d:prop><d:getetag>"no-data-etag"</d:getetag></d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/123/calendars/work/cdata.ics</d:href>
    <d:propstat>
      <d:prop><c:calendar-data><![CDATA[BEGIN:VCALENDAR
SUMMARY:raw <tag> &amp; kept
END:VCALENDAR]]></c:calendar-data></d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/123/calendars/work/empty-resourcetype/</d:href>
    <d:propstat>
      <d:prop><d:resourcetype/><d:displayname>&#x5DE5;&#x4F5C;</d:displayname></d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`

describe('parseMultistatus', () => {
  it('parses WeCom multistatus with relative hrefs and no response-level status', () => {
    const responses = parseMultistatus(WECOM_MULTISTATUS)
    assert.equal(responses.length, 2)
    assert.equal(responses[0]?.href, '/calendar/')
    assert.equal(responses[0]?.status, 'HTTP/1.1 200 OK')
    assert.equal(responses[0]?.props.displayname, '公司日历')
    assert.ok(responses[0]?.props.resourcetype?.includes('calendar'))
    assert.equal(responses[0]?.props['sync-token'], 'http://example.test/ns/sync/42')
    assert.equal(responses[1]?.href, '/calendar/project%20a/')
    assert.equal(responses[1]?.props.displayname, 'Project & Ops')
  })

  it('parses iCloud multistatus: principal/home hrefs, escaped and CDATA calendar-data', () => {
    const responses = parseMultistatus(ICLOUD_MULTISTATUS)
    assert.equal(responses.length, 7)

    assert.equal(responses[0]?.props['current-user-principal'], '/123/principal/')
    assert.equal(
      responses[1]?.props['calendar-home-set'],
      'https://p01-caldav.icloud.com/123/calendars/',
    )

    const work = responses[2]
    assert.equal(work?.href, '/123/calendars/work/')
    assert.equal(work?.props.displayname, 'Work & Travel')
    assert.equal(work?.props.getetag, '"calendar-etag"')
    // The 404 propstat must not mask a missing calendar-data with an empty value.
    assert.equal(work?.props['calendar-data'], undefined)

    const event = responses[3]
    assert.equal(event?.props.getetag, '"event-etag"')
    assert.equal(
      event?.props['calendar-data'],
      'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nSUMMARY:a < b\r\nEND:VCALENDAR',
    )
    assert.equal(event?.status, 'HTTP/1.1 200 OK')

    const noData = responses[4]
    assert.equal(noData?.props['calendar-data'], undefined)
    assert.equal(noData?.props.getetag, '"no-data-etag"')

    // CDATA is copied verbatim: markup inside it is data, not XML.
    const cdata = responses[5]
    assert.ok(cdata?.props['calendar-data']?.includes('SUMMARY:raw <tag> &amp; kept'))

    const emptyResourceType = responses[5 + 1]
    assert.equal(emptyResourceType?.props.resourcetype, '')
    assert.equal(emptyResourceType?.props.displayname, '工作')
  })

  it('returns [] for empty or non-multistatus input', () => {
    assert.deepEqual(parseMultistatus(''), [])
    assert.deepEqual(parseMultistatus('not xml at all'), [])
  })

  it('ignores comments and decodes numeric character references', () => {
    const xml = `<d:multistatus xmlns:d="DAV:">
      <!-- a comment that must not leak into values -->
      <d:response>
        <d:href>/c/</d:href>
        <d:propstat>
          <d:prop><d:displayname>&#26085;&#x5386;</d:displayname></d:prop>
          <d:status>HTTP/1.1 200 OK</d:status>
        </d:propstat>
      </d:response>
    </d:multistatus>`
    const [response] = parseMultistatus(xml)
    assert.equal(response?.props.displayname, '日历')
  })
})
