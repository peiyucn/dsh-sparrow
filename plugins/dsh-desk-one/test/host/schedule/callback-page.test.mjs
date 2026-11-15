// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { escapeHtml, renderOutlookCallbackPage } from '../../../lib/host/schedule/callback-page.js'

describe('escapeHtml', () => {
  it('escapes every HTML-significant character', () => {
    assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
  })

  it('leaves ordinary text untouched', () => {
    assert.equal(escapeHtml('Outlook 已连接：请回到 Desk One'), 'Outlook 已连接：请回到 Desk One')
  })
})

describe('renderOutlookCallbackPage', () => {
  it('escapes an attacker-supplied error message instead of rendering it', () => {
    const page = renderOutlookCallbackPage({ ok: false, message: '<script>alert(1)</script><img src=x onerror=alert(2)>' })
    assert.ok(!page.body.includes('<script>alert(1)</script>'))
    assert.ok(!page.body.includes('<img src=x'))
    assert.ok(page.body.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  })

  it('pins the success script with the CSP nonce and posts nothing to the opener', () => {
    const page = renderOutlookCallbackPage({ ok: true, message: 'Outlook 已连接，请回到 Desk One 关闭本窗口。' })
    const nonce = /<script nonce="([^"]+)">/u.exec(page.body)?.[1]
    assert.ok(nonce !== undefined && nonce !== '')
    assert.equal(page.contentSecurityPolicy, `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`)
    assert.ok(page.body.includes('window.close()'))
    // No listener exists in the client half: a message to the opener is dead code, and the
    // wildcard target origin would leak the outcome to any origin that kept a reference.
    assert.ok(!page.body.includes('postMessage'))
  })

  it('renders no script on failure and uses a fresh nonce per response', () => {
    const failed = renderOutlookCallbackPage({ ok: false, message: 'Microsoft 拒绝了登录' })
    assert.ok(!failed.body.includes('<script'))
    assert.ok(!failed.contentSecurityPolicy.includes('nonce-undefined'))
    const first = renderOutlookCallbackPage({ ok: true, message: 'a' })
    const second = renderOutlookCallbackPage({ ok: true, message: 'a' })
    assert.notEqual(first.contentSecurityPolicy, second.contentSecurityPolicy)
    assert.equal(first.body.split('<script').length, 2)
  })
})
