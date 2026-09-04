import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isTrustedBrowserRequest } from '../lib/host.js'

describe('isTrustedBrowserRequest 浏览器信任标记检查（官方 /api 栅栏同口径）', () => {
  it('同源 Origin 应该 放行', () => {
    assert.equal(isTrustedBrowserRequest({ host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' }), true)
  })

  it('跨站 Origin 应该 拒绝', () => {
    assert.equal(isTrustedBrowserRequest({ host: '127.0.0.1:3080', origin: 'http://evil.example' }), false)
  })

  it('sec-fetch-site 跨站 应该 拒绝（即使无 Origin）', () => {
    assert.equal(isTrustedBrowserRequest({ host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' }), false)
  })

  it('同源 sec-fetch-site 应该 放行', () => {
    assert.equal(isTrustedBrowserRequest({ host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'sec-fetch-site': 'same-origin' }), true)
  })

  it('无浏览器标记（curl 等）应该 放行', () => {
    assert.equal(isTrustedBrowserRequest({ host: '127.0.0.1:3080' }), true)
  })

  it('origin: null（沙箱 iframe）应该 拒绝', () => {
    assert.equal(isTrustedBrowserRequest({ host: '127.0.0.1:3080', origin: 'null' }), false)
  })

  it('非法 Origin 应该 拒绝', () => {
    assert.equal(isTrustedBrowserRequest({ host: '127.0.0.1:3080', origin: 'not a url' }), false)
  })

  it('缺 host 应该 拒绝', () => {
    assert.equal(isTrustedBrowserRequest({ origin: 'http://127.0.0.1:3080' }), false)
    assert.equal(isTrustedBrowserRequest({ host: '' }), false)
  })

  it('LAN 同源（host 与 origin 同 authority）应该 放行', () => {
    assert.equal(isTrustedBrowserRequest({ host: '192.168.1.5:3080', origin: 'http://192.168.1.5:3080' }), true)
  })
})
