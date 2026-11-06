// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assertCapabilities, missingCapabilities } from '../../lib/compat.js'
import { hasCapability, missingCapabilities as missingClientCapabilities, warnMissingCapabilities } from '../../lib/client/compat.js'

/** 收集告警的最小 ctx 桩。 */
const fakeCtx = () => {
  const warns = []
  const originalWarn = console.warn
  console.warn = (...args) => { warns.push(args.join(' ')) }
  return {
    ctx: { logger: { warn: (message) => warns.push(message) } },
    warns,
    restore: () => { console.warn = originalWarn },
  }
}

describe('host 能力门（抛错即自停用）', () => {
  it('missingCapabilities 应该 按声明顺序返回未满足项', () => {
    assert.deepEqual(missingCapabilities([
      { name: 'a', ok: true }, { name: 'b', ok: false }, { name: 'c', ok: false },
    ]), ['b', 'c'])
  })

  it('能力齐全 应该 不抛不告警', () => {
    const { ctx, warns, restore } = fakeCtx()
    try {
      assert.doesNotThrow(() => { assertCapabilities(ctx, 'dsh-x', [{ name: 'a', ok: true }]) })
      assert.equal(warns.length, 0)
    } finally { restore() }
  })

  it('能力缺失 应该 告警并抛错（cordis 标 inactive）', () => {
    const { ctx, warns, restore } = fakeCtx()
    try {
      assert.throws(() => {
        assertCapabilities(ctx, 'dsh-x', [{ name: 'storageDomain.open', ok: false }])
      }, /dsh-x: 缺少本插件依赖的 storageDomain\.open/u)
      assert.equal(warns.length, 1)
      assert.match(warns[0], /已停用插件以免影响 dsh/u)
    } finally { restore() }
  })
})

describe('client 能力门（只告警，不抛错）', () => {
  it('missingCapabilities 纯逻辑与 client 版一致', () => {
    assert.deepEqual(missingClientCapabilities([{ name: 'x', ok: false }]), ['x'])
  })

  it('缺失时 应该 返回 false 且不抛错（boot 审计致命失败防线）', () => {
    const { ctx, warns, restore } = fakeCtx()
    try {
      let result = true
      assert.doesNotThrow(() => {
        result = warnMissingCapabilities(ctx, 'dsh-x', [{ name: 'ctx.slots.inject', ok: false }])
      })
      assert.equal(result, false)
      assert.ok(warns.some(message => /已停用插件以免影响 dsh/u.test(message)))
    } finally { restore() }
  })

  it('hasCapability 探针 应该 吞掉抛错并按类型判定', () => {
    assert.equal(hasCapability(() => () => {}), true)
    assert.equal(hasCapability(() => { throw new Error('boom') }), false)
    assert.equal(hasCapability(() => undefined), false)
    assert.equal(hasCapability(() => 'text', 'string'), true)
  })
})
