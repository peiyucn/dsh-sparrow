import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isLoopbackHostname, isTrustedPluginRequest, officialTrustedHosts } from '../lib/trust.js'

/**
 * 浏览器信任栅栏（官方 /api 栅栏同口径：`packages/client/connection/src/api-request-trust.ts`
 * 的 `isTrustedApiRequest` + `loopback-hostname.ts` 的 `isLoopbackHostname`）。
 *
 * 起因（实测）：官方栅栏注册在 `/api` **前缀**路由上，而 webServer 的路由匹配是
 * 「精确表优先、前缀最长者胜」（`packages/host/webserver/src/index.ts` 的 `match()`）
 * ——本插件的 `/api/codebuddy-credits` 比 `/api` 长，请求命中本路由后不再经过官方检查。
 * 实测 `GET /api/codebuddy-credits/status` 无栅栏时 200、官方 `/api/sessions` 401。
 */

describe('isLoopbackHostname 回环判定（官方 loopback-hostname.ts 同口径）', () => {
  it('localhost / IPv6 回环 / 127.0.0.1 应该 为真', () => {
    assert.equal(isLoopbackHostname('localhost'), true)
    assert.equal(isLoopbackHostname('[::1]'), true)
    assert.equal(isLoopbackHostname('127.0.0.1'), true)
  })

  it('127/8 内任意地址 应该 为真（不只 .0.1）', () => {
    assert.equal(isLoopbackHostname('127.0.0.53'), true)
    assert.equal(isLoopbackHostname('127.255.255.255'), true)
  })

  it('非 127/8（含 128/8 与 LAN 地址）应该 为假', () => {
    assert.equal(isLoopbackHostname('128.0.0.1'), false)
    assert.equal(isLoopbackHostname('192.168.1.5'), false)
    assert.equal(isLoopbackHostname('0.0.0.0'), false)
    assert.equal(isLoopbackHostname('example.com'), false)
  })

  it('畸形 IPv4（八位组越界 / 段数不对 / 非数字）应该 为假', () => {
    assert.equal(isLoopbackHostname('127.0.0.256'), false)
    assert.equal(isLoopbackHostname('127.0.0'), false)
    assert.equal(isLoopbackHostname('127.0.0.1.5'), false)
    assert.equal(isLoopbackHostname('127.0.0.x'), false)
    assert.equal(isLoopbackHostname('0x7f.0.0.1'), false)
  })
})

describe('isTrustedPluginRequest 浏览器信任栅栏', () => {
  it('同源 loopback 应该 放行', () => {
    assert.equal(isTrustedPluginRequest({ host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' }), true)
  })

  it('无浏览器标记的本机请求（curl 等）应该 放行', () => {
    assert.equal(isTrustedPluginRequest({ host: '127.0.0.1:3080' }), true)
  })

  it('⛔ DNS rebinding：Host 与 Origin 同是攻击者域名 应该 拒绝', () => {
    // 这条是「只比 Origin 与 Host 是否同源」的朴素写法会**错误放行**的用例：
    // rebinding 页面里 host 与 origin 都是攻击者域名、彼此同源，但 Host 不是我们的。
    assert.equal(isTrustedPluginRequest({ host: 'evil.example:3080', origin: 'http://evil.example:3080' }), false)
    assert.equal(isTrustedPluginRequest({ host: 'evil.example:3080' }), false)
  })

  it('跨站 Origin 应该 拒绝', () => {
    assert.equal(isTrustedPluginRequest({ host: '127.0.0.1:3080', origin: 'http://evil.example' }), false)
  })

  it('sec-fetch-site: cross-site 即使无 Origin 也应该 拒绝', () => {
    assert.equal(isTrustedPluginRequest({ host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' }), false)
  })

  it('同源 sec-fetch-site 应该 放行', () => {
    assert.equal(
      isTrustedPluginRequest({ host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'sec-fetch-site': 'same-origin' }),
      true,
    )
  })

  it('sec-fetch-site: none（地址栏直达）应该 放行', () => {
    assert.equal(isTrustedPluginRequest({ host: '127.0.0.1:3080', 'sec-fetch-site': 'none' }), true)
  })

  it('origin: null（沙箱 iframe / file: 页面）应该 拒绝', () => {
    assert.equal(isTrustedPluginRequest({ host: '127.0.0.1:3080', origin: 'null' }), false)
  })

  it('畸形 Origin 应该 拒绝', () => {
    assert.equal(isTrustedPluginRequest({ host: '127.0.0.1:3080', origin: 'not a url' }), false)
  })

  it('缺 host / 空 host 应该 拒绝（Host 是所有请求的硬门）', () => {
    assert.equal(isTrustedPluginRequest({ origin: 'http://127.0.0.1:3080' }), false)
    assert.equal(isTrustedPluginRequest({ host: '' }), false)
  })

  it('请求头整体缺失 应该 拒绝（fail-closed，且不抛错）', () => {
    assert.equal(isTrustedPluginRequest(undefined), false)
    assert.equal(isTrustedPluginRequest(null), false)
  })

  it('畸形 Host（不可解析）应该 拒绝', () => {
    assert.equal(isTrustedPluginRequest({ host: 'not a host' }), false)
    assert.equal(isTrustedPluginRequest({ host: '127.0.0.1:99999' }), false)
  })

  it('IPv6 回环 Host 应该 放行（带括号的 authority 形式）', () => {
    assert.equal(isTrustedPluginRequest({ host: '[::1]:3080' }), true)
    assert.equal(isTrustedPluginRequest({ host: '[::1]:3080', origin: 'http://[::1]:3080' }), true)
  })

  it('localhost 与 127.0.0.1 互相之间不算同源（Origin 必须等于 Host）', () => {
    assert.equal(isTrustedPluginRequest({ host: 'localhost:3080', origin: 'http://127.0.0.1:3080' }), false)
  })

  it('大小写与多余 :80 不参与判定（WhatWG 归一化）', () => {
    assert.equal(isTrustedPluginRequest({ host: 'LOCALHOST:80', origin: 'http://localhost' }), true)
  })
})

describe('isTrustedPluginRequest 的官方信任面（webRuntime.trustedHosts）', () => {
  it('LAN IP 未配置时 应该 拒绝（默认只信回环）', () => {
    assert.equal(isTrustedPluginRequest({ host: '192.168.1.5:3080', origin: 'http://192.168.1.5:3080' }), false)
    assert.equal(isTrustedPluginRequest({ host: '192.168.1.5:3080' }, []), false)
  })

  it('同一 LAN IP 在官方信任面里（带端口，精确匹配）应该 放行', () => {
    assert.equal(
      isTrustedPluginRequest({ host: '192.168.1.5:3080', origin: 'http://192.168.1.5:3080' }, ['192.168.1.5:3080']),
      true,
    )
  })

  it('带端口的条目只匹配该端口', () => {
    const trusted = ['192.168.1.5:3080']
    assert.equal(isTrustedPluginRequest({ host: '192.168.1.5:9999' }, trusted), false)
  })

  it('不带端口的条目匹配该 hostname 的任意端口', () => {
    const trusted = ['192.168.1.5']
    assert.equal(isTrustedPluginRequest({ host: '192.168.1.5:3080' }, trusted), true)
    assert.equal(isTrustedPluginRequest({ host: '192.168.1.5:9999' }, trusted), true)
    assert.equal(isTrustedPluginRequest({ host: '192.168.1.5' }, trusted), true)
  })

  it('不带端口的条目不放行同名的其它 hostname', () => {
    assert.equal(isTrustedPluginRequest({ host: '192.168.1.6:3080' }, ['192.168.1.5']), false)
  })

  it('域名条目按 WHATWG 归一化比较（大小写 / 多余 :80 不决定信任）', () => {
    assert.equal(isTrustedPluginRequest({ host: 'harness.internal:80' }, ['HARNESS.internal']), true)
    assert.equal(isTrustedPluginRequest({ host: 'harness.internal:3080' }, ['harness.internal:3080']), true)
  })

  it('已授权的 LAN authority 上，跨站 Origin 仍要拒绝（授权不等于免 Origin 校验）', () => {
    assert.equal(
      isTrustedPluginRequest({ host: '192.168.1.5:3080', origin: 'http://evil.example' }, ['192.168.1.5:3080']),
      false,
    )
  })
})

/**
 * 官方信任面读取：复用官方 `webRuntime.trustedHosts` 而不是自造第二份白名单。
 *
 * 官方 `@deepseek-ai/dsh-web-app` 的 `resolveLanTrust` + `apply` 在 webServer 绑定后
 * 采样一次 LAN 地址、`ctx.provide('webRuntime', ...)` 提供出来；那份 `trustedHosts`
 * 就是喂给官方 `/api` 栅栏的**同一份值**。本插件逐字复用，服务缺失时保守回退为空。
 */
describe('officialTrustedHosts 官方信任面读取（缺服务时保守回退）', () => {
  it('服务在场 应该 逐字采纳官方取值', () => {
    const ctx = { get: (name) => (name === 'webRuntime' ? { lanAddresses: ['192.168.1.5'], trustedHosts: ['192.168.1.5', 'lab.internal:3080'] } : undefined) }
    assert.deepEqual(officialTrustedHosts(ctx), ['192.168.1.5', 'lab.internal:3080'])
  })

  it('服务缺失（老宿主 / 非 web 组合）应该 回退空数组 = 只信回环', () => {
    assert.deepEqual(officialTrustedHosts({ get: () => undefined }), [])
  })

  it('null / 非对象 应该 回退空数组', () => {
    assert.deepEqual(officialTrustedHosts({ get: () => null }), [])
    assert.deepEqual(officialTrustedHosts({ get: () => 'nope' }), [])
    assert.deepEqual(officialTrustedHosts({ get: () => 42 }), [])
  })

  it('trustedHosts 非数组 / 缺失 应该 回退空数组', () => {
    assert.deepEqual(officialTrustedHosts({ get: () => ({ trustedHosts: 'lab.internal' }) }), [])
    assert.deepEqual(officialTrustedHosts({ get: () => ({}) }), [])
    assert.deepEqual(officialTrustedHosts({ get: () => ({ trustedHosts: null }) }), [])
  })

  it('数组里的非字符串条目被过滤（不把畸形值喂进栅栏）', () => {
    const ctx = { get: () => ({ trustedHosts: ['lab.internal', 42, null, undefined, { host: 'x' }] }) }
    assert.deepEqual(officialTrustedHosts(ctx), ['lab.internal'])
  })

  it('ctx.get 抛错（“without inject” 代理路径）应该 回退空数组且不抛穿', () => {
    const ctx = { get: () => { throw new Error('cannot get property "webRuntime" without inject') } }
    assert.deepEqual(officialTrustedHosts(ctx), [])
  })

  it('官方取值真的参与判定：LAN authority 只因为官方列了它才放行', () => {
    const ctx = { get: () => ({ trustedHosts: ['192.168.1.5:3080'] }) }
    const headers = { host: '192.168.1.5:3080', origin: 'http://192.168.1.5:3080' }
    assert.equal(isTrustedPluginRequest(headers, officialTrustedHosts(ctx)), true)
    // 同一请求、官方没列它（服务缺失）→ 拒绝：上面那条放行确实来自官方取值。
    assert.equal(isTrustedPluginRequest(headers, officialTrustedHosts({ get: () => undefined })), false)
  })
})
