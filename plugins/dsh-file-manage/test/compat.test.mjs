import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assertCapabilities, missingCapabilities } from '../lib/compat.js'

// 根 AGENTS《插件与宿主兼容》：宿主契约不认识时插件必须自停用（抛错 → cordis 标 inactive），
// 而不是带病运行。本文件覆盖能力门纯判定与接线；容器行为由 cordis 保证（lib/index.js:1350-1362）。
describe('compat 宿主兼容自检（纯能力版）', () => {
  const fakeCtx = () => {
    const warns = []
    return { ctx: { logger: { warn: (message) => { warns.push(message) } } }, warns }
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
    assert.doesNotThrow(() => { assertCapabilities(ctx, 'dsh-x', [{ name: 'webServer.register', ok: true }]) })
    assert.equal(warns.length, 0)
  })

  it('能力缺失 应该 告警并抛错（停用）', () => {
    const { ctx, warns } = fakeCtx()
    assert.throws(() => { assertCapabilities(ctx, 'dsh-x', [{ name: 'webServer.register', ok: false }]) }, /webServer\.register/u)
    assert.equal(warns.length, 1)
    assert.match(warns[0], /已停用插件以免影响 dsh/u)
  })
})
