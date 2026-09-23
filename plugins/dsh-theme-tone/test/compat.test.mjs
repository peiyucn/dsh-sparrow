import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cssSupports, hasCapability, missingCapabilities, warnMissingCapabilities, warnUser } from '../lib/compat.js'

// 根 AGENTS《插件与宿主兼容》：宿主契约不认识时插件必须自停用，而不是带病运行。
// 本插件的门装在 **client half**，语义是「惰性停用」—— 告警后直接返回，**绝不抛错**：
// 客户端 boot 审计把任何非 active 的 entry 当致命失败（dsh 0.1.7-alpha.1
// packages/client/web/src/boot-client.ts:63-82），client 侧抛错会让宿主整个 Web UI
// 停在 "Failed to load plugins"。本文件覆盖能力门纯判定与接线。
describe('compat 宿主兼容自检（纯能力版，客户端惰性停用）', () => {
  const fakeCtx = () => {
    const warns = []
    return { ctx: { logger: { warn: message => { warns.push(message) } } }, warns }
  }

  it('missingCapabilities 应该 按声明顺序返回未满足项', () => {
    assert.deepEqual(missingCapabilities([
      { name: 'a', ok: true }, { name: 'b', ok: false }, { name: 'c', ok: false },
    ]), ['b', 'c'])
  })

  it('空能力表 应该 视为齐备', () => {
    assert.deepEqual(missingCapabilities([]), [])
  })

  it('能力齐备 应该 返回 true 且不告警', (t) => {
    const printed = t.mock.method(console, 'warn', () => {})
    const { ctx, warns } = fakeCtx()
    assert.equal(warnMissingCapabilities(ctx, 'dsh-x', [{ name: 'theme.overrideTokens', ok: true }]), true)
    assert.equal(warns.length, 0)
    assert.equal(printed.mock.callCount(), 0)
  })

  it('能力缺失 应该 告警（logger + console 同一句）并返回 false —— 不抛错', (t) => {
    // 抛错 = 宿主整页起不来；只写 logger = 用户看不到（客户端 logger 默认只有环形缓冲
    // exporter，浏览器侧没有 console 通道）。故两条通道都要写。
    const printed = []
    t.mock.method(console, 'warn', message => { printed.push(message) })
    const { ctx, warns } = fakeCtx()
    let ok
    assert.doesNotThrow(() => {
      ok = warnMissingCapabilities(ctx, 'dsh-x', [{ name: 'ctx.settingsScope.bind', ok: false }])
    })
    assert.equal(ok, false)
    assert.equal(warns.length, 1)
    assert.equal(printed.length, 1)
    assert.equal(printed[0], warns[0], 'console 与 logger 必须是同一句话')
    assert.match(warns[0], /ctx\.settingsScope\.bind/u)
    assert.match(warns[0], /已停用插件以免影响 dsh/u)
    assert.match(warns[0], /升级本插件或运行环境后自动恢复/u)
  })

  it('warnUser 应该 在 ctx.logger 缺失时仍然告警（console 是无条件通道）', (t) => {
    const printed = []
    t.mock.method(console, 'warn', message => { printed.push(message) })
    assert.doesNotThrow(() => { warnUser({}, 'dsh-x: 缺服务') })
    assert.deepEqual(printed, ['dsh-x: 缺服务'])
  })
})

describe('compat 能力探针', () => {
  it('hasCapability 应该 按 typeof 判定，取值抛错时视为缺失', () => {
    assert.equal(hasCapability(() => () => {}), true)
    assert.equal(hasCapability(() => undefined), false)
    assert.equal(hasCapability(() => { throw new Error('boom') }), false)
    assert.equal(hasCapability(() => 42, 'number'), true)
  })

  it('cssSupports 应该 在无 CSS.supports 的环境下返回 false 而不是崩', () => {
    // Node 运行环境没有 CSS 全局
    assert.equal(cssSupports('mix-blend-mode: screen'), false)
  })
})
