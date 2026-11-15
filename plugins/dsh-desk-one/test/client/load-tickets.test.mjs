// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createLoadTickets } from '../../lib/client/app/utils.js'

describe('createLoadTickets', () => {
  it('keeps only the newest ticket current', () => {
    const tickets = createLoadTickets()
    const first = tickets.take()
    assert.equal(tickets.isLatest(first), true)
    const second = tickets.take()
    assert.equal(tickets.isLatest(second), true)
    assert.equal(tickets.isLatest(first), false, '一次更新请求作废所有更早的票')
  })

  it('handles the initial state and unknown tickets', () => {
    const tickets = createLoadTickets()
    assert.equal(tickets.isLatest(0), false, '0 不是有效票：忘调 take() 不能算当前')
    assert.equal(tickets.isLatest(7), false)
    assert.equal(tickets.take(), 1)
    assert.equal(tickets.isLatest(0), false)
    assert.equal(tickets.isLatest(7), false)
  })

  it('separate guards do not share tickets', () => {
    const left = createLoadTickets()
    const right = createLoadTickets()
    const leftTicket = left.take()
    right.take()
    assert.equal(left.isLatest(leftTicket), true)
  })
})
