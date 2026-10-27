// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assertCapabilities, assertHostCompatible, hasCapability,
  missingCapabilities, SUPPORTED_SESSION_FORMAT_VERSIONS, unsupportedSessionFormatReason, unsupportedStoredFormatReason,
  warnMissingCapabilities,
} from '../lib/compat.js'
import { hostSessionFormatVersion } from '../lib/session-format.js'
import { clientCapabilities } from '../lib/client/capabilities.js'
import { fakeHostCtx } from './helpers/fake-ctx.ts'

/** 临时静音 console.warn（client 门的第二条告警通道），返回还原函数。 */
function silenceConsoleWarn() {
  const original = console.warn
  console.warn = () => {}
  return () => { console.warn = original }
}

/**
 * 造一个「能力齐备」的假客户端宿主；服务方法只记录是否被**调用**——门只该探测存在性。
 * @param {string} omit - 要摘掉的能力（`slots.inject` 这类写法），缺省表示全给。
 * @param {string[]} calls - 调用记录（被门调用即证明门越过了探测边界）。
 */
function fakeClientHost(omit = '', calls = []) {
  const host = {
    slots: {
      inject: () => { calls.push('slots.inject') },
      register: () => { calls.push('slots.register') },
    },
    locale: {
      register: () => { calls.push('locale.register'); return () => {} },
      bind: () => { calls.push('locale.bind'); return () => '' },
    },
    sessions: {
      scope: () => { calls.push('sessions.scope'); return undefined },
    },
  }
  if (omit !== '') {
    const [group, method] = omit.split('.')
    delete host[group][method]
  }
  return host
}

// 根 AGENTS《插件与宿主兼容》：宿主契约不认识时插件必须自停用（抛错 → cordis 标 inactive），
// 而不是带病运行。本文件覆盖纯判定与接线；容器行为由 cordis 保证（lib/index.js:1350-1362）。
describe('compat 宿主兼容自检（会话版）', () => {

  it('支持的会话格式版本 应该 返回 undefined（不拦）', () => {
    for (const version of SUPPORTED_SESSION_FORMAT_VERSIONS) {
      assert.equal(unsupportedSessionFormatReason(version), undefined)
    }
  })

  it('未来更高的会话格式版本（如 5）应该 返回原因', () => {
    const reason = unsupportedSessionFormatReason(5)
    assert.ok(reason !== undefined)
    assert.match(reason, /v5/u)
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
    const { ctx, warns } = fakeHostCtx()
    assert.doesNotThrow(() => { assertHostCompatible(ctx, 'dsh-x', 0) })
    assert.equal(warns.length, 0)
  })

  it('不兼容时 应该 告警并抛错（停用）', () => {
    const { ctx, warns } = fakeHostCtx()
    assert.throws(() => { assertHostCompatible(ctx, 'dsh-x', 5) }, /dsh-x: .*v5/u)
    assert.equal(warns.length, 1)
    assert.match(warns[0], /已停用插件以免影响 dsh/u)
  })

  // 宿主真值门：header 由宿主给出，不受「插件解析到旧版官方包」影响。
  describe('宿主真值格式门（会话 header）', () => {
    it('空列表 应该 返回 undefined（没有会话可判定）', () => {
      assert.equal(unsupportedStoredFormatReason([]), undefined)
    })

    it('全部 header 支持 应该 返回 undefined', () => {
      assert.equal(unsupportedStoredFormatReason([{ version: 0 }, { version: 3 }, { version: 4 }]), undefined)
    })

    it('任一 header 不支持 应该 返回带来源标注的原因', () => {
      const reason = unsupportedStoredFormatReason([{ version: 0 }, { version: 5 }])
      assert.ok(reason !== undefined)
      assert.match(reason, /v5/u)
      assert.match(reason, /宿主会话 header/u)
    })

    it('header 版本缺失 应该 按不支持处理（保守）', () => {
      assert.ok(unsupportedStoredFormatReason([{}]) !== undefined)
    })
  })

  describe('能力门（宿主能力面）', () => {
    it('missingCapabilities 应该 按声明顺序返回未满足项', () => {
      assert.deepEqual(missingCapabilities([
        { name: 'a', ok: true }, { name: 'b', ok: false }, { name: 'c', ok: false },
      ]), ['b', 'c'])
    })

    it('能力齐备 应该 不抛不告警', () => {
      const { ctx, warns } = fakeHostCtx()
      assert.doesNotThrow(() => { assertCapabilities(ctx, 'dsh-x', [{ name: 'llm', ok: true }]) })
      assert.equal(warns.length, 0)
    })

    it('能力缺失 应该 告警并抛错（停用）', () => {
      const { ctx, warns } = fakeHostCtx()
      assert.throws(() => { assertCapabilities(ctx, 'dsh-x', [{ name: 'llm.registerAdapter', ok: false }]) }, /llm\.registerAdapter/u)
      assert.equal(warns.length, 1)
      assert.match(warns[0], /已停用插件以免影响 dsh/u)
    })
  })
})

// client half 的硬约束：**绝不抛错**。宿主 boot 审计把任一非 active entry 当致命失败，
// 抛错会让整页只渲染 "Failed to load plugins"；故缺能力只告警并返回 false，调用方直接 return。
describe('client half 能力门（不抛错的惰性停用）', () => {
  it('能力齐备 应该 返回 true、不告警，且不调用任何服务', () => {
    const { ctx, warns } = fakeHostCtx()
    const calls = []
    assert.equal(warnMissingCapabilities(ctx, 'dsh-x', clientCapabilities(fakeClientHost('', calls))), true)
    assert.equal(warns.length, 0)
    assert.deepEqual(calls, [], '门只探测方法存在性，不得调用服务')
  })

  it('缺任一能力 应该 只告警并返回 false —— 不抛错、不注册任何槽位 / 样式', () => {
    for (const missing of ['slots.inject', 'slots.register', 'locale.register', 'locale.bind', 'sessions.scope']) {
      const restore = silenceConsoleWarn()
      try {
        const { ctx, warns } = fakeHostCtx()
        const calls = []
        const capabilities = clientCapabilities(fakeClientHost(missing, calls))
        let passed
        assert.doesNotThrow(() => { passed = warnMissingCapabilities(ctx, 'dsh-x', capabilities) })
        assert.equal(passed, false, missing)
        assert.equal(warns.length, 1, missing)
        assert.match(warns[0], /已停用插件以免影响 dsh/u)
        assert.ok(warns[0].includes(`ctx.${missing}`), `告警必须点名缺的那一项：${warns[0]}`)
        assert.deepEqual(calls, [], `${missing}：门不得注册任何东西`)
      } finally {
        restore()
      }
    }
  })

  it('能力表 应该 覆盖本插件实际用到的五项服务面', () => {
    assert.deepEqual(clientCapabilities(fakeClientHost()).map(capability => capability.name), [
      'ctx.slots.inject', 'ctx.slots.register', 'ctx.locale.register', 'ctx.locale.bind', 'ctx.sessions.scope',
    ])
  })

  it('hasCapability 应该 把缺失 / 抛错的探针都判为缺能力', () => {
    assert.equal(hasCapability(() => () => {}), true)
    assert.equal(hasCapability(() => undefined), false)
    assert.equal(hasCapability(() => { throw new Error('boom') }), false)
    assert.equal(hasCapability(() => 'text', 'function'), false)
  })
})
