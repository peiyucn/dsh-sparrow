// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assertCapabilities,
  duplicateRegistrationCode,
  hasCapability,
  missingCapabilities,
  warnMissingCapabilities,
  warnRegistrationFailure,
} from '../lib/compat.js'
import {
  hostSessionFormatVersion,
  SUPPORTED_SESSION_FORMAT_VERSIONS,
  unsupportedSessionFormatReason,
} from '../lib/session-format.js'
import { fakeHostCtx } from './helpers/fake-ctx.ts'

/** 临时静音 console.warn（client 门的第二条告警通道），返回还原函数。 */
function silenceConsoleWarn() {
  const original = console.warn
  console.warn = () => {}
  return () => { console.warn = original }
}

// 宿主契约不认识时插件必须自停用（抛错 → cordis 标 inactive）；本文件覆盖能力门纯判定与接线。
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

describe('注册冲突处理（DUPLICATE_* 只告警、不清理他插件）', () => {
  it('duplicateRegistrationCode 应该 只认 DUPLICATE_ 前缀的字符串 code', () => {
    assert.equal(duplicateRegistrationCode({ code: 'DUPLICATE_DIRECTORY' }), 'DUPLICATE_DIRECTORY')
    assert.equal(duplicateRegistrationCode({ code: 'DUPLICATE_DISCOVERY' }), 'DUPLICATE_DISCOVERY')
    assert.equal(duplicateRegistrationCode({ code: 'INVALID_DIRECTORY' }), undefined)
    assert.equal(duplicateRegistrationCode({ code: 42 }), undefined)
    assert.equal(duplicateRegistrationCode(null), undefined)
    assert.equal(duplicateRegistrationCode(new Error('boom')), undefined)
  })

  it('冲突 应该 给出明确 DUPLICATE 文案且不再记错误堆栈', () => {
    const restore = silenceConsoleWarn()
    try {
      const { ctx, warns } = fakeHostCtx()
      warnRegistrationFailure(ctx, 'llm-codebuddy-credits', '设置页 provider 目录', { code: 'DUPLICATE_DIRECTORY' })
      assert.equal(warns.length, 1)
      assert.match(warns[0], /设置页 provider 目录 已被其他插件注册/u)
      assert.match(warns[0], /DUPLICATE_DIRECTORY/u)
      assert.match(warns[0], /不会清理其他插件的注册/u)
    } finally {
      restore()
    }
  })

  it('其他错误 应该 记日志后继续，不向外抛', () => {
    const { ctx, warns } = fakeHostCtx()
    assert.doesNotThrow(() => {
      warnRegistrationFailure(ctx, 'llm-codebuddy-credits', 'provider 路由', new Error('boom'))
    })
    assert.equal(warns.length, 2)
    assert.match(String(warns[0]), /provider 路由 注册失败/u)
  })
})

// 会话格式**软门**（只告警不停用）；集合须与 archive-manage / chat-fim 一致，
// 漏掉当前格式会给官方当前版本持续发误导告警。
describe('会话格式门（软判定）', () => {
  it('支持集合必须包含官方当前格式（0.1.7 起为 4）', () => {
    assert.ok(
      SUPPORTED_SESSION_FORMAT_VERSIONS.includes(4),
      `支持集合 ${JSON.stringify(SUPPORTED_SESSION_FORMAT_VERSIONS)} 漏了当前格式 4 —— 会导致永久的误导告警`,
    )
  })

  it('与 archive-manage / chat-fim 同一集合（[0, 3, 4]）', () => {
    assert.deepEqual([...SUPPORTED_SESSION_FORMAT_VERSIONS].sort((a, b) => a - b), [0, 3, 4])
  })

  it('当前格式 应该 不告警；未来格式 应该 告警（软门不停用）', () => {
    assert.equal(unsupportedSessionFormatReason(4), undefined)
    assert.match(String(unsupportedSessionFormatReason(5)), /v5/u)
    assert.match(String(unsupportedSessionFormatReason(undefined)), /未知/u)
  })

  it('宿主上报的版本应该 能读到（命名空间访问，缺导出时 undefined 而非链接期失败）', () => {
    const version = hostSessionFormatVersion()
    assert.ok(version === undefined || typeof version === 'number')
  })
})
