import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assertCapabilities, cssSupports, hasCapability, missingCapabilities } from '../lib/compat.js'

// 根 AGENTS《插件与宿主兼容》：宿主契约不认识时插件必须自停用（抛错 → cordis 标 inactive），
// 而不是带病运行。本文件覆盖能力门纯判定与接线；容器行为由 cordis 保证（lib/index.js:1350-1362）。
describe('compat 宿主兼容自检（纯能力版）', () => {
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

  it('能力齐备 应该 不抛不告警', () => {
    const { ctx, warns } = fakeCtx()
    assert.doesNotThrow(() => { assertCapabilities(ctx, 'dsh-x', [{ name: 'theme.overrideTokens', ok: true }]) })
    assert.equal(warns.length, 0)
  })

  it('能力缺失 应该 告警并抛错（停用）', () => {
    const { ctx, warns } = fakeCtx()
    assert.throws(
      () => { assertCapabilities(ctx, 'dsh-x', [{ name: 'theme.overrideTokens', ok: false }]) },
      /theme\.overrideTokens/u,
    )
    assert.equal(warns.length, 1)
    assert.match(warns[0], /已停用插件以免影响 dsh/u)
    assert.match(warns[0], /升级本插件或运行环境后自动恢复/u)
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
