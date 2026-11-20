import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { OutlookOAuth } from '../../../lib/host/schedule/outlook-oauth.js'

const CALLBACK = '/api/desk-one/schedule/outlook/callback'

function fakeCtx(origin?: string) {
  return {
    logger: { warn: () => {}, info: () => {}, debug: () => {} },
    get: (name: string) => name === 'webServer' && origin !== undefined
      ? { getOrigin: () => origin }
      : undefined,
  }
}

function oauth(origin?: string) {
  return new OutlookOAuth(fakeCtx(origin) as never, {}, {
    syncSource: async () => ({ ok: true }),
    state: () => ({}),
  })
}

describe('Outlook OAuth 回调地址端口', () => {
  it('桌面端 window.location 无端口时，用宿主 webServer 端口补全回调', async () => {
    const start = await oauth('http://127.0.0.1:62551').startOutlookLogin(`http://localhost${CALLBACK}`)
    assert.equal(start.kind, 'redirect')
    const authUrl = start.authUrl
    assert.ok(authUrl !== undefined)
    assert.equal(
      new URL(authUrl).searchParams.get('redirect_uri'),
      `http://localhost:62551${CALLBACK}`,
    )
  })

  it('宿主 origin 是 localhost 时保留端口，不退回 80', async () => {
    const start = await oauth('http://localhost:62551').startOutlookLogin(`http://localhost${CALLBACK}`)
    const authUrl = start.authUrl
    assert.ok(authUrl !== undefined)
    assert.equal(new URL(authUrl).searchParams.get('redirect_uri'), `http://localhost:62551${CALLBACK}`)
  })

  it('没有 webServer 服务时保留调用方校验过的回调（测试与旧宿主兼容）', async () => {
    const requested = `http://localhost${CALLBACK}`
    const start = await oauth().startOutlookLogin(requested)
    const authUrl = start.authUrl
    assert.ok(authUrl !== undefined)
    assert.equal(new URL(authUrl).searchParams.get('redirect_uri'), requested)
  })
})
