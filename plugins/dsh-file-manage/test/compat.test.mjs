// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assertCapabilities, hasCapability, missingCapabilities, warnMissingCapabilities } from '../lib/compat.js'
import { fakeHostCtx } from './helpers/fake-ctx.ts'

/** 临时静音 console.warn（client 门的第二条告警通道），返回还原函数。 */
function silenceConsoleWarn() {
  const original = console.warn
  console.warn = () => {}
  return () => { console.warn = original }
}


// 根 AGENTS《插件与宿主兼容》：宿主契约不认识时插件必须自停用（抛错 → cordis 标 inactive），
// 而不是带病运行。本文件覆盖能力门纯判定与接线；容器行为由 cordis 保证（lib/index.js:1350-1362）。
describe('compat 宿主兼容自检（纯能力版）', () => {

  it('missingCapabilities 应该 按声明顺序返回未满足项', () => {
    assert.deepEqual(missingCapabilities([
      { name: 'a', ok: true }, { name: 'b', ok: false }, { name: 'c', ok: false },
    ]), ['b', 'c'])
  })

  it('空能力表 应该 视为齐备', () => {
    assert.deepEqual(missingCapabilities([]), [])
  })

  it('能力齐备 应该 不抛不告警', () => {
    const { ctx, warns } = fakeHostCtx()
    assert.doesNotThrow(() => { assertCapabilities(ctx, 'dsh-x', [{ name: 'webServer.register', ok: true }]) })
    assert.equal(warns.length, 0)
  })

  it('能力缺失 应该 告警并抛错（停用）', () => {
    const { ctx, warns } = fakeHostCtx()
    assert.throws(() => { assertCapabilities(ctx, 'dsh-x', [{ name: 'webServer.register', ok: false }]) }, /webServer\.register/u)
    assert.equal(warns.length, 1)
    assert.match(warns[0], /已停用插件以免影响 dsh/u)
  })

  it('client 门能力齐备 应该 返回 true 且不告警', () => {
    const { ctx, warns } = fakeHostCtx()
    assert.equal(warnMissingCapabilities(ctx, 'dsh-x', [{ name: 'slots.inject', ok: true }]), true)
    assert.equal(warns.length, 0)
  })

  it('client 门能力缺失 应该 只告警并返回 false（绝不抛错，否则整页 boot 失败）', () => {
    const restore = silenceConsoleWarn()
    try {
      const { ctx, warns } = fakeHostCtx()
      assert.equal(warnMissingCapabilities(ctx, 'dsh-x', [
        { name: 'ctx.slots.inject', ok: false },
        { name: 'ctx.locale.register', ok: false },
      ]), false)
      assert.equal(warns.length, 1)
      assert.match(warns[0], /ctx\.slots\.inject、ctx\.locale\.register/u)
      assert.match(warns[0], /已停用插件以免影响 dsh/u)
    } finally {
      restore()
    }
  })

  it('hasCapability 应该 把缺失 / 抛错的探针都判为缺能力', () => {
    assert.equal(hasCapability(() => () => {}), true)
    assert.equal(hasCapability(() => undefined), false)
    assert.equal(hasCapability(() => { throw new Error('boom') }), false)
    assert.equal(hasCapability(() => 'text', 'function'), false)
  })
})
