import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isEmbeddedWindow } from '../lib/perf-mode.js'
import { buildRowCss } from '../lib/client/styles.js'

const { readFile } = await import('node:fs/promises')
const client = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')

describe('perf-mode：嵌入式环境的性能模式', () => {
  it('顶层窗口应该 判定为 false（独立浏览器保留完整效果）', () => {
    const win = {}
    win.self = win
    win.top = win
    assert.equal(isEmbeddedWindow(win), false)
  })

  it('iframe / webview 嵌套应该 判定为 true（走性能模式）', () => {
    const top = {}
    assert.equal(isEmbeddedWindow({ self: {}, top }), true)
    // 跨源 iframe 拿到的 top 是别的 WindowProxy，身份比较不抛错、不相等。
    assert.equal(isEmbeddedWindow({ self: {}, top: {} }), true)
  })

  it('⛔ 性能模式必须：只注入设置行样式、永远挂 PLAIN 门、背景层常隐、跳过探测', () => {
    // 判据链：ensureStyles(performanceMode) 只拼 buildRowCss；paintPlain 在性能模式下强制写 PLAIN；
    // paintLayer 的 hidden 与 performanceMode 取或；probeWorkstart / runProbe / startPhaseSettle 早退。
    assert.match(client, /const performanceMode = isEmbeddedWindow\(window\)/u, '入口要按嵌入环境判定')
    assert.match(client, /function ensureStyles\(performanceMode: boolean\)/u, 'ensureStyles 要接收判定结果')
    assert.match(client, /performanceMode\s*\n?\s*\? buildRowCss\(\)/u, '性能模式只注入设置行样式')
    assert.match(client, /if \(plain \|\| performanceMode\) target\.setAttribute\(PLAIN_ATTR/u, '性能模式必须强制挂 PLAIN 门')
    assert.match(client, /const hidden = performanceMode \|\| plan\.hidden/u, '性能模式背景层常隐')
    assert.match(client, /if \(performanceMode\) return\s*\n\s*probeWorkstart\(\)/u, 'runProbe 在性能模式下早退')
    assert.match(client, /if \(performanceMode\) return\s*\n\s*const target = markerHost/u, 'probeWorkstart 在性能模式下早退')
    assert.match(client, /if \(performanceMode\) return\s*\n\s*lastPhaseAt = performance\.now\(\)/u, '相位重测在性能模式下早退')
    assert.match(client, /if \(!performanceMode\) publishPhase\(\)/u, '性能模式不初跑相位测量')
  })

  it('设置行样式与性能模式无关（降级后设置仍可正常操作）', () => {
    assert.ok(buildRowCss().includes('dsh-theme-tone'), '设置行样式必须始终注入')
  })
})
