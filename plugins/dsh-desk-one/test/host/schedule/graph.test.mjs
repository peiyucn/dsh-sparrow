// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { graphEventDraft } from '../../../lib/host/schedule/providers/graph.js'

const base = {
  id: 'AAMkAGI2',
  iCalUId: '040000008200E00074C5B7101A82E008',
  subject: '周会',
  bodyPreview: '议题：进度同步',
  location: { displayName: 'C01-1202' },
  start: { dateTime: '2026-11-09T10:00:00.0000000', timeZone: 'UTC' },
  end: { dateTime: '2026-11-09T11:00:00.0000000', timeZone: 'UTC' },
  isAllDay: false,
  showAs: 'busy',
  webLink: 'https://outlook.live.com/calendar/event',
}

describe('Graph 事件映射', () => {
  it('UTC 时间、忙碌状态、链接与 iCal UID 映射为统一 EventDraft', () => {
    const draft = graphEventDraft(base)
    assert.equal(draft?.start, '2026-11-09T10:00:00.000Z')
    assert.equal(draft?.end, '2026-11-09T11:00:00.000Z')
    assert.equal(draft?.timezone, 'UTC')
    assert.equal(draft?.busy, true)
    assert.equal(draft?.externalId, base.iCalUId)
    assert.equal(draft?.uid, base.iCalUId)
    assert.equal(draft?.location, 'C01-1202')
    assert.equal(draft?.url, 'https://outlook.live.com/calendar/event')
  })

  it('空闲时段不占忙、取消事件丢弃、全天事件保留标记', () => {
    assert.equal(graphEventDraft({ ...base, showAs: 'free' })?.busy, false)
    assert.equal(graphEventDraft({ ...base, isCancelled: true }), undefined)
    assert.equal(graphEventDraft({ ...base, isAllDay: true })?.allDay, true)
  })
})
