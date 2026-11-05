// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assertTrustedAuthority, isLoopbackHostname, isTrustedAuthority, isTrustedPluginRequest, parseAuthority,
} from '../lib/trust.js'

describe('信任栅栏：Host / Origin / sec-fetch-site', () => {
  it('parseAuthority 应该 拒绝不可解析的 authority', () => {
    assert.equal(parseAuthority('127.0.0.1:3080')?.host, '127.0.0.1:3080')
    assert.equal(parseAuthority(''), undefined)
    assert.equal(parseAuthority('bad host'), undefined)
  })

  it('回环判定 应该 覆盖 localhost / IPv6 / 127/8，排除相似域名', () => {
    for (const host of ['localhost', '[::1]', '127.0.0.1', '127.8.9.10']) {
      assert.equal(isLoopbackHostname(host), true, host)
    }
    for (const host of ['example.com', '127.0.0.1.evil.com', '10.0.0.1']) {
      assert.equal(isLoopbackHostname(host), false, host)
    }
  })

  it('带端口的信任条目 只匹配该 authority；不带端口的匹配任意端口', () => {
    const withPort = parseAuthority('192.168.1.5:31000')
    assert.ok(withPort)
    assert.equal(isTrustedAuthority(withPort, ['192.168.1.5:31000']), true)
    assert.equal(isTrustedAuthority(withPort, ['192.168.1.5:3080']), false)
    const noPort = parseAuthority('192.168.1.5:9999')
    assert.ok(noPort)
    assert.equal(isTrustedAuthority(noPort, ['192.168.1.5']), true)
  })

  it('assertTrustedAuthority 应该 拒绝带 scheme / 路径 / user@ 的条目', () => {
    assert.doesNotThrow(() => assertTrustedAuthority('192.168.1.5:31000'))
    for (const bad of ['http://192.168.1.5', '192.168.1.5/path', 'user@192.168.1.5', '192.168.1.5:']) {
      assert.throws(() => assertTrustedAuthority(bad), /不是裸 host\[:port\] authority/u, bad)
    }
  })

  it('本机回环请求 应该 放行（无 Origin 也可）', () => {
    assert.equal(isTrustedPluginRequest({ host: '127.0.0.1:3080' }), true)
    assert.equal(isTrustedPluginRequest({ host: 'localhost:3080', origin: 'http://localhost:3080' }), true)
  })

  it('DNS rebinding / 跨站 / 异源 应该 拒绝', () => {
    assert.equal(isTrustedPluginRequest({ host: 'evil.example:3080' }), false)
    assert.equal(isTrustedPluginRequest({ host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' }), false)
    assert.equal(isTrustedPluginRequest({ host: '127.0.0.1:3080', origin: 'http://evil.example' }), false)
    assert.equal(isTrustedPluginRequest({ host: '127.0.0.1:3080', origin: 'null' }), false)
  })

  it('额外信任面 应该 生效（LAN 部署）', () => {
    assert.equal(
      isTrustedPluginRequest({ host: '192.168.1.5:31000' }, ['192.168.1.5:31000']),
      true,
    )
  })
})
