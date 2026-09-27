import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assertCapabilities, hostSessionFormatVersion, missingCapabilities, SUPPORTED_SESSION_FORMAT_VERSIONS, unsupportedSessionFormatReason } from '../lib/compat.js'

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

// 会话格式**软门**（只告警不停用）。2026-09 审计发现本集合此前漏了 `4`（0.1.7 起的当前格式，
// 与 archive-manage / chat-fim 的 `[0,3,4]` 不一致）—— 后果是在官方当前版本上每次启动都发一条
// 「积分可能显示为 0」的**误导**告警。这条断言把它钉死，防止再漏。
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
    // 装在 node_modules 里的官方包应当导出 SESSION_FORMAT_VERSION；读不到也只会退化成
    // 「未知 → 告警」，不会抛错 —— 这正是命名空间访问的目的。
    const version = hostSessionFormatVersion()
    assert.ok(version === undefined || typeof version === 'number')
  })
})
