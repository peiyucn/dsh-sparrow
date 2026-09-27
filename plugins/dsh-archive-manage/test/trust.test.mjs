import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import {
  assertTrustedAuthority, isLoopbackHostname, isTrustedAuthority, isTrustedPluginRequest,
  officialTrustedHosts, parseAuthority,
} from '../lib/trust.js'

// 信任栅栏（2026-09 安全审计）：官方栅栏只装在自己的 `/api` 前缀路由里，而 webServer 按
// 「最长前缀」选路由 —— 本插件的 `/api/archive-manage` 更长，官方那道门连同浏览器令牌
// 鉴权都不会执行。实测（未带任何凭据）：官方 `/api/sessions` → 401，本插件路由曾 → **200**。
// 本文件覆盖纯判定 + **接线**（判定存在但没被调用 = 漏洞仍在）。

describe('isLoopbackHostname 回环判定（对齐官方 loopback-hostname.ts）', () => {
  it('localhost / IPv6 回环 / 127 网段 应该 true', () => {
    assert.equal(isLoopbackHostname('localhost'), true)
    assert.equal(isLoopbackHostname('[::1]'), true)
    assert.equal(isLoopbackHostname('127.0.0.1'), true)
    assert.equal(isLoopbackHostname('127.9.9.9'), true)
    assert.equal(isLoopbackHostname('127.255.255.255'), true)
  })

  it('非回环 应该 false', () => {
    assert.equal(isLoopbackHostname('0.0.0.0'), false)
    assert.equal(isLoopbackHostname('192.168.1.5'), false)
    assert.equal(isLoopbackHostname('10.0.0.1'), false)
    assert.equal(isLoopbackHostname('evil.example'), false)
    // 128 不是 127/8；超出 255 的段也不是合法 IPv4。
    assert.equal(isLoopbackHostname('128.0.0.1'), false)
    assert.equal(isLoopbackHostname('127.0.0.999'), false)
    assert.equal(isLoopbackHostname('127.0.0'), false)
  })
})

describe('parseAuthority 规范化', () => {
  it('缺省端口去掉、大小写归一', () => {
    assert.equal(parseAuthority('LOCALHOST:80')?.host, 'localhost')
    assert.equal(parseAuthority('127.0.0.1:3080')?.host, '127.0.0.1:3080')
  })

  it('不可解析 应该 undefined（空串、无点无冒号的裸词）', () => {
    assert.equal(parseAuthority('not a host'), undefined)
    assert.equal(parseAuthority(''), undefined)
    // ⚠️ `http://127.0.0.1:3080` 会被当成 authority `http:` + 端口 → 解析**成功**，
    // 得到 host `http`；这类形状由 assertTrustedAuthority（要求原样存活）拦下，
    // 不是靠 parseAuthority 返回 undefined。
    assert.equal(parseAuthority('http://127.0.0.1:3080')?.host, 'http')
    // 带前导空白在 WHATWG 下抛错；带尾随空白则被静默修剪（故同样不能当合法条目）。
    assert.equal(parseAuthority(' harness.internal'), undefined)
    assert.equal(parseAuthority('harness.internal ')?.host, 'harness.internal')
  })
})

describe('isTrustedPluginRequest 请求检查（对齐官方 isTrustedApiRequest）', () => {
  it('同源 Origin 应该 放行', () => {
    assert.equal(isTrustedPluginRequest({ host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' }), true)
  })

  it('localhost / IPv6 回环 / 127 网段 应该 放行', () => {
    assert.equal(isTrustedPluginRequest({ host: 'localhost:3080' }), true)
    assert.equal(isTrustedPluginRequest({ host: '[::1]:3080' }), true)
    assert.equal(isTrustedPluginRequest({ host: '127.9.9.9:3080' }), true)
  })

  it('DNS rebinding：Host 指向攻击者域名时必须拒绝（即使 Origin 与 Host 自洽）', () => {
    // 「只比 Origin 与 Host 是否同源」的朴素写法会错放这一类：两者一致，但 Host 不是本机。
    // 官方注释写明 Host 是 rebinding 唯一伪造不了的头部 —— 故 Host 必须过回环判定。
    assert.equal(isTrustedPluginRequest({ host: 'evil.example:3080', origin: 'http://evil.example:3080' }), false)
    assert.equal(isTrustedPluginRequest({ host: 'evil.example:3080' }), false)
  })

  it('非回环 LAN authority 默认拒绝（不擅自扩张官方栅栏的信任集）', () => {
    assert.equal(isTrustedPluginRequest({ host: '192.168.1.5:3080', origin: 'http://192.168.1.5:3080' }), false)
  })

  it('跨站 Origin 应该 拒绝', () => {
    assert.equal(isTrustedPluginRequest({ host: '127.0.0.1:3080', origin: 'http://evil.example' }), false)
  })

  it('sec-fetch-site 跨站 应该 拒绝（即使无 Origin）', () => {
    assert.equal(isTrustedPluginRequest({ host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' }), false)
  })

  it('同源 sec-fetch-site 应该 放行', () => {
    assert.equal(isTrustedPluginRequest({ host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'sec-fetch-site': 'same-origin' }), true)
  })

  it('origin: null（沙箱 iframe / file:）应该 拒绝', () => {
    assert.equal(isTrustedPluginRequest({ host: '127.0.0.1:3080', origin: 'null' }), false)
  })

  it('非法 Origin 应该 拒绝', () => {
    assert.equal(isTrustedPluginRequest({ host: '127.0.0.1:3080', origin: 'not a url' }), false)
  })

  it('缺 Host / 空 Host / 不可解析 Host 应该 拒绝', () => {
    assert.equal(isTrustedPluginRequest({ origin: 'http://127.0.0.1:3080' }), false)
    assert.equal(isTrustedPluginRequest({ host: '' }), false)
    assert.equal(isTrustedPluginRequest({ host: 'http://127.0.0.1:3080' }), false)
  })

  it('无浏览器标记（本机客户端 / 被剥标记的读取）应该 放行 —— 由 Host 栅栏兜底', () => {
    assert.equal(isTrustedPluginRequest({ host: '127.0.0.1:3080' }), true)
  })
})

describe('allowedHosts 额外信任面（对齐官方 trustedHosts 语义）', () => {
  it('声明的 LAN authority 应该 放行', () => {
    assert.equal(
      isTrustedPluginRequest({ host: '192.168.1.5:3080', origin: 'http://192.168.1.5:3080' }, ['192.168.1.5:3080']),
      true,
    )
  })

  it('带端口的条目只匹配该端口；不带端口的条目匹配任意端口', () => {
    assert.equal(isTrustedPluginRequest({ host: '192.168.1.5:3080' }, ['192.168.1.5:3080']), true)
    assert.equal(isTrustedPluginRequest({ host: '192.168.1.5:9999' }, ['192.168.1.5:3080']), false)
    assert.equal(isTrustedPluginRequest({ host: '192.168.1.5:9999' }, ['192.168.1.5']), true)
  })

  it('未声明的其他 authority 仍然拒绝', () => {
    assert.equal(isTrustedPluginRequest({ host: 'evil.example:3080' }, ['192.168.1.5:3080']), false)
  })

  it('冗余 :80 与大小写不决定信任（两侧同走 WHATWG 规范化）', () => {
    assert.equal(isTrustedPluginRequest({ host: 'Host.Example:80' }, ['host.example']), true)
  })

  it('isTrustedAuthority 对不可解析条目 应该 false（不因坏配置放行）', () => {
    assert.equal(isTrustedAuthority(new URL('http://127.0.0.1:3080'), ['http://evil.example']), false)
  })
})

describe('assertTrustedAuthority 条目形状护栏（对齐官方同名校验）', () => {
  it('裸 host / host:port 应该 通过', () => {
    assert.doesNotThrow(() => assertTrustedAuthority('harness.internal'))
    assert.doesNotThrow(() => assertTrustedAuthority('harness.internal:8443'))
    assert.doesNotThrow(() => assertTrustedAuthority('192.168.1.5:3080'))
  })

  it('会被静默改写的条目必须响亮失败（否则会悄悄放宽授权）', () => {
    // 带 scheme / 路径 / user@ —— 后者会授权内嵌的主机名。
    assert.throws(() => assertTrustedAuthority('https://harness.internal'), /不是裸 host/)
    assert.throws(() => assertTrustedAuthority('harness.internal/path'), /不是裸 host/)
    assert.throws(() => assertTrustedAuthority('user@harness.internal'), /不是裸 host/)
    // 悬空冒号 / 补零端口（会把「只授权某端口」放宽成所有端口）。
    assert.throws(() => assertTrustedAuthority('harness.internal:'), /不是裸 host/)
    assert.throws(() => assertTrustedAuthority('harness.internal:080'), /不是裸 host/)
    // 非规范主机拼写。
    assert.throws(() => assertTrustedAuthority('0x7f.0.0.1'), /不是裸 host/)
    assert.throws(() => assertTrustedAuthority(' harness.internal'), /不是裸 host/)
  })
})

describe('officialTrustedHosts 复用官方信任面（不造第二份真相）', () => {
  it('官方 webRuntime.trustedHosts 被原样采纳（LAN 部署与官方同口径）', () => {
    const ctx = { get: (name) => (name === 'webRuntime' ? { lanAddresses: ['192.168.1.5'], trustedHosts: ['192.168.1.5', 'lab.internal:8443'] } : undefined) }
    assert.deepEqual(officialTrustedHosts(ctx), ['192.168.1.5', 'lab.internal:8443'])
  })

  it('服务缺失（老宿主 / 非 web 部署）应该回退为空 = 只认回环', () => {
    assert.deepEqual(officialTrustedHosts({ get: () => undefined }), [])
  })

  it('形状不对时保守回退为空，绝不抛穿（host half 不可因此停用）', () => {
    assert.deepEqual(officialTrustedHosts({ get: () => null }), [])
    assert.deepEqual(officialTrustedHosts({ get: () => 'nope' }), [])
    assert.deepEqual(officialTrustedHosts({ get: () => ({ trustedHosts: 'not-an-array' }) }), [])
    assert.deepEqual(officialTrustedHosts({ get: () => ({ trustedHosts: [42, 'ok.example', null] }) }), ['ok.example'])
  })

  it('ctx.get 抛错时也不冒泡', () => {
    assert.deepEqual(officialTrustedHosts({ get: () => { throw new Error('boom') } }), [])
  })

  it('官方信任面确实参与判定（LAN authority 由官方取值放行）', () => {
    const ctx = { get: () => ({ trustedHosts: ['192.168.1.5:3080'] }) }
    assert.equal(
      isTrustedPluginRequest({ host: '192.168.1.5:3080', origin: 'http://192.168.1.5:3080' }, officialTrustedHosts(ctx)),
      true,
    )
  })
})

describe('接线：栅栏必须真正挡在路由前面', () => {
  it('前缀处理器先过栅栏，再进入任何路由分发（含只读路由）', () => {
    // 判定正确但没被调用 = 漏洞仍在。故这里直接钉住源码里的调用顺序。
    const source = readFileSync(new URL('../src/host.ts', import.meta.url), 'utf8')
    const fenceAt = source.indexOf('isTrustedPluginRequest(req.headers, officialTrustedHosts(ctx))')
    assert.ok(fenceAt > 0, '处理器里必须调用 isTrustedPluginRequest（带官方信任面）')
    const firstRouteAt = source.indexOf('pathname === `${PREFIX}/list`')
    assert.ok(firstRouteAt > 0, '应当能找到第一个路由分支')
    assert.ok(fenceAt < firstRouteAt, '栅栏必须排在所有路由分支之前')
    // 栅栏必须在读取请求体之前 —— 否则恶意请求仍会驱动一次 body 读取。
    const bodyReadAt = source.indexOf('readJsonBody(req)')
    assert.ok(bodyReadAt < 0 || fenceAt < bodyReadAt, '栅栏必须排在读取请求体之前')
  })
})
