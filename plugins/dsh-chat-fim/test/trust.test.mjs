import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import {
  isLoopbackHostname, isTrustedAuthority, isTrustedBrowserRequest, officialTrustedHosts, parseAuthority,
} from '../lib/trust.js'

// 信任栅栏（2026-09 安全审计）：官方栅栏与浏览器令牌鉴权只注册在官方自己的 `/api` 前缀
// 路由上，而 webServer 的路由解析是「精确表优先、前缀最长者胜」—— 插件路由不会经过它。
// 实测（未带任何凭据）：官方 `/api/sessions` → 401，各插件 `/api/<plugin>` 路由曾 → **200**。
// 本文件覆盖纯判定 + **接线**（判定存在但没被调用 = 漏洞仍在）。

describe('isLoopbackHostname 回环判定（对齐官方 loopback-hostname.ts）', () => {
  it('localhost / IPv6 回环 / 127 网段 应该 true', () => {
    assert.equal(isLoopbackHostname('localhost'), true)
    assert.equal(isLoopbackHostname('[::1]'), true)
    assert.equal(isLoopbackHostname('127.0.0.1'), true)
    assert.equal(isLoopbackHostname('127.9.9.9'), true)
  })

  it('非回环 应该 false', () => {
    assert.equal(isLoopbackHostname('192.168.1.5'), false)
    assert.equal(isLoopbackHostname('evil.example'), false)
    assert.equal(isLoopbackHostname('128.0.0.1'), false)
    assert.equal(isLoopbackHostname('127.0.0.999'), false)
  })
})

describe('isTrustedBrowserRequest 请求检查（对齐官方 isTrustedApiRequest）', () => {
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

  it('无浏览器标记（本机客户端）应该 放行 —— 由 Host 栅栏兜底', () => {
    assert.equal(isTrustedBrowserRequest({ host: '127.0.0.1:3080' }), true)
  })

  it('origin: null（沙箱 iframe / file:）应该 拒绝', () => {
    assert.equal(isTrustedBrowserRequest({ host: '127.0.0.1:3080', origin: 'null' }), false)
  })

  it('非法 Origin 应该 拒绝', () => {
    assert.equal(isTrustedBrowserRequest({ host: '127.0.0.1:3080', origin: 'not a url' }), false)
  })

  it('缺 Host / 空 Host / 不可解析 Host 应该 拒绝', () => {
    assert.equal(isTrustedBrowserRequest({ origin: 'http://127.0.0.1:3080' }), false)
    assert.equal(isTrustedBrowserRequest({ host: '' }), false)
    assert.equal(isTrustedBrowserRequest({ host: 'http://127.0.0.1:3080' }), false)
  })

  it('headers 整体缺失应该 拒绝（fail-closed，不因畸形输入抛错）', () => {
    assert.equal(isTrustedBrowserRequest(undefined), false)
    assert.equal(isTrustedBrowserRequest(null), false)
  })

  it('DNS rebinding：Host 指向攻击者域名时必须拒绝（即使 Origin 与 Host 自洽）', () => {
    // 「只比 Origin 与 Host 是否同源」的朴素写法会错放这一类：两者一致，但 Host 不是本机。
    // 官方注释写明 Host 是 rebinding 唯一伪造不了的头部 —— 故 Host 必须过回环判定。
    assert.equal(isTrustedBrowserRequest({ host: 'evil.example:3080', origin: 'http://evil.example:3080' }), false)
    assert.equal(isTrustedBrowserRequest({ host: 'evil.example:3080' }), false)
  })

  it('非回环 LAN authority 默认拒绝（不擅自扩张官方栅栏的信任集）', () => {
    assert.equal(isTrustedBrowserRequest({ host: '192.168.1.5:3080', origin: 'http://192.168.1.5:3080' }), false)
  })
})

describe('allowedHosts 额外信任面（对齐官方 trustedHosts 语义）', () => {
  it('声明的 LAN authority 应该 放行', () => {
    assert.equal(isTrustedBrowserRequest({ host: '192.168.1.5:3080', origin: 'http://192.168.1.5:3080' }, ['192.168.1.5:3080']), true)
  })

  it('带端口的条目只匹配该端口；不带端口的条目匹配任意端口', () => {
    assert.equal(isTrustedBrowserRequest({ host: '192.168.1.5:3080' }, ['192.168.1.5:3080']), true)
    assert.equal(isTrustedBrowserRequest({ host: '192.168.1.5:9999' }, ['192.168.1.5:3080']), false)
    assert.equal(isTrustedBrowserRequest({ host: '192.168.1.5:9999' }, ['192.168.1.5']), true)
  })

  it('冗余 :80 与大小写不决定信任（两侧同走 WHATWG 规范化）', () => {
    assert.equal(isTrustedBrowserRequest({ host: 'Host.Example:80' }, ['host.example']), true)
  })

  it('isTrustedAuthority 对不可解析条目 应该 false（不因坏配置放行）', () => {
    assert.equal(isTrustedAuthority(new URL('http://127.0.0.1:3080'), ['http://evil.example']), false)
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
      isTrustedBrowserRequest({ host: '192.168.1.5:3080', origin: 'http://192.168.1.5:3080' }, officialTrustedHosts(ctx)),
      true,
    )
  })
})

describe('parseAuthority 规范化', () => {
  it('缺省端口去掉、大小写归一', () => {
    assert.equal(parseAuthority('LOCALHOST:80')?.host, 'localhost')
    assert.equal(parseAuthority('127.0.0.1:3080')?.host, '127.0.0.1:3080')
  })

  it('不可解析 应该 undefined（空串、含空白的裸词）', () => {
    assert.equal(parseAuthority('not a host'), undefined)
    assert.equal(parseAuthority(''), undefined)
    assert.equal(parseAuthority(' harness.internal'), undefined)
  })
})

describe('接线：栅栏必须真正挡在路由前面', () => {
  it('处理器先过栅栏，再进入任何路由分发（GET 与 POST 都在其后）', () => {
    // 判定正确但没被调用 = 漏洞仍在。故这里直接钉住源码里的调用顺序。
    const source = readFileSync(new URL('../src/host.ts', import.meta.url), 'utf8')
    const fenceAt = source.indexOf('isTrustedBrowserRequest(req.headers, officialTrustedHosts(ctx))')
    assert.ok(fenceAt > 0, '处理器里必须调用 isTrustedBrowserRequest（带官方信任面）')
    const getBranchAt = source.indexOf("if (req.method === 'GET')")
    assert.ok(getBranchAt > 0, '应当能找到 GET 分支')
    assert.ok(fenceAt < getBranchAt, '栅栏必须排在 GET 分支之前（曾只在 POST 前设防）')
    const methodCheckAt = source.indexOf("if (req.method !== 'POST')")
    assert.ok(methodCheckAt < 0 || fenceAt < methodCheckAt, '栅栏必须排在方法判定之前')
    // 栅栏必须在**调用**读取请求体之前 —— 否则恶意请求仍会驱动一次 body 读取。
    // （注意锚在调用点 `await readRequestBody(`，函数定义本身在文件更前面。）
    const bodyReadAt = source.indexOf('await readRequestBody(')
    assert.ok(bodyReadAt > 0, '应当能找到 readRequestBody 调用点')
    assert.ok(fenceAt < bodyReadAt, '栅栏必须排在读取请求体之前')
  })
})
