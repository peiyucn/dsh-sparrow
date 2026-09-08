import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assertHostCompatible, assertStoredFormatSupported, hostSessionFormatVersion,
  SUPPORTED_SESSION_FORMAT_VERSIONS, unsupportedSessionFormatReason, unsupportedStoredFormatReason,
} from '../lib/compat.js'

// 根 AGENTS《插件与宿主兼容》：宿主契约不认识时插件必须自停用（抛错 → cordis 标 inactive），
// 而不是带病运行。本文件覆盖纯判定与接线；容器行为由 cordis 保证（lib/index.js:1350-1362）。
describe('compat 宿主兼容自检', () => {
  const fakeCtx = () => {
    const warns = []
    return { ctx: { logger: { warn: (message) => { warns.push(message) } } }, warns }
  }

  it('支持的会话格式版本 应该 返回 undefined（不拦）', () => {
    for (const version of SUPPORTED_SESSION_FORMAT_VERSIONS) {
      assert.equal(unsupportedSessionFormatReason(version), undefined)
    }
  })

  it('更高的会话格式版本（如 0.1.5 的 3）应该 返回原因', () => {
    const reason = unsupportedSessionFormatReason(3)
    assert.ok(reason !== undefined)
    assert.match(reason, /v3/u)
    assert.match(reason, /v0/u)
  })

  it('非数字等未知形状 应该 按不支持处理', () => {
    for (const version of [undefined, null, '0', {}, Number.NaN]) {
      assert.ok(unsupportedSessionFormatReason(version) !== undefined, String(version))
    }
  })

  it('自定义支持集合 应该 生效', () => {
    assert.equal(unsupportedSessionFormatReason(7, [7]), undefined)
    assert.ok(unsupportedSessionFormatReason(7, [0]) !== undefined)
  })

  it('宿主导出的会话格式版本 应该 可读（命名空间访问不产生链接期失败）', () => {
    assert.equal(typeof hostSessionFormatVersion(), 'number')
  })

  it('兼容时 应该 不抛不告警', () => {
    const { ctx, warns } = fakeCtx()
    assert.doesNotThrow(() => { assertHostCompatible(ctx, 'dsh-x', 0) })
    assert.equal(warns.length, 0)
  })

  it('不兼容时 应该 告警并抛错（停用）', () => {
    const { ctx, warns } = fakeCtx()
    assert.throws(() => { assertHostCompatible(ctx, 'dsh-x', 3) }, /dsh-x: .*v3/u)
    assert.equal(warns.length, 1)
    assert.match(warns[0], /已停用插件以免影响 dsh/u)
  })

  // 宿主真值门：header 由宿主给出，不受「插件解析到旧版官方包」影响。
  describe('宿主真值格式门（会话 header）', () => {
    it('空列表 应该 返回 undefined（没有会话可判定）', () => {
      assert.equal(unsupportedStoredFormatReason([]), undefined)
    })

    it('全部 header 支持 应该 返回 undefined', () => {
      assert.equal(unsupportedStoredFormatReason([{ version: 0 }, { version: 0 }]), undefined)
    })

    it('任一 header 不支持 应该 返回带来源标注的原因', () => {
      const reason = unsupportedStoredFormatReason([{ version: 0 }, { version: 3 }])
      assert.ok(reason !== undefined)
      assert.match(reason, /v3/u)
      assert.match(reason, /宿主会话 header/u)
    })

    it('header 版本缺失 应该 按不支持处理（保守）', () => {
      assert.ok(unsupportedStoredFormatReason([{}]) !== undefined)
    })

    it('assertStoredFormatSupported：支持不抛、不支持抛错', () => {
      assert.doesNotThrow(() => { assertStoredFormatSupported('dsh-x') })
      assert.doesNotThrow(() => { assertStoredFormatSupported('dsh-x', { version: 0 }) })
      assert.throws(() => { assertStoredFormatSupported('dsh-x', { version: 3 }) }, /已拒绝本次操作/u)
    })
  })
})
