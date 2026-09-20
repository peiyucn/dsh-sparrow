import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isDashedRing, isWorkstartProbe, rendersContent } from '../lib/workstart.js'

/** 官方那条 ::after 的 mask 实际长这样（内联 SVG 圆角矩形 + 虚线描边）。 */
const OFFICIAL_DASHED_MASK =
  'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\'%3E%3Crect width=\'100%25\' ' +
  'height=\'100%25\' fill=\'none\' rx=\'22\' ry=\'22\' stroke=\'black\' stroke-width=\'2\' ' +
  'stroke-dasharray=\'4 4\'/%3E%3C/svg%3E")'

describe('workstart：未选工作区待启动态的判定（纯函数）', () => {
  it('rendersContent 应该 认 content:"" 为「在渲染」、认 none/normal/空 为「没渲染」', () => {
    // 官方那条正是 content:""（带引号的空串）——**是**在渲染，不能判成 false。
    assert.equal(rendersContent('""'), true, 'content:"" 是在渲染')
    assert.equal(rendersContent('"x"'), true)
    assert.equal(rendersContent('none'), false)
    assert.equal(rendersContent('normal'), false)
    assert.equal(rendersContent(''), false)
    assert.equal(rendersContent('  none  '), false, '两侧空白要 trim')
  })

  it('应该 命中官方那条虚线圆角框（content 存在 + mask 含 stroke-dasharray）', () => {
    assert.equal(
      isWorkstartProbe({ content: '""', maskImage: OFFICIAL_DASHED_MASK, webkitMaskImage: '' }),
      true,
      '只看 mask-image 也要命中',
    )
    assert.equal(
      isWorkstartProbe({ content: '""', maskImage: '', webkitMaskImage: OFFICIAL_DASHED_MASK }),
      true,
      '只看 -webkit-mask-image 也要命中（Chrome 实际给这份）',
    )
  })

  it('⛔ 普通态不得误命中 —— 这是本判据存在的全部理由', () => {
    // 普通态卡片的 ::after 不存在：content 为 none。
    assert.equal(
      isWorkstartProbe({ content: 'none', maskImage: OFFICIAL_DASHED_MASK, webkitMaskImage: '' }),
      false,
      'content:none 时即便 mask 偶然带 dasharray 也不算',
    )
    // 普通态就算有 ::after，也不会带虚线遮罩（其它插件用的是渐变遮罩）。
    assert.equal(
      isWorkstartProbe({ content: '""', maskImage: 'linear-gradient(black, transparent)', webkitMaskImage: '' }),
      false,
      '实色渐变遮罩不得算作虚线框',
    )
    assert.equal(isWorkstartProbe({ content: 'none', maskImage: '', webkitMaskImage: '' }), false)
  })

  it('应该 大小写不敏感，且认已解码与未解码两种 mask 形态', () => {
    const decoded = 'url("data:image/svg+xml,<svg><rect stroke-DashArray=\'4 4\'/></svg>")'
    assert.equal(isDashedRing({ content: '""', maskImage: decoded, webkitMaskImage: '' }), true)
    const encoded = 'url("data:image/svg+xml,%3Crect stroke-dasharray%3D%274%204%27/%3E")'
    assert.equal(isDashedRing({ content: '""', maskImage: '', webkitMaskImage: encoded }), true)
  })

  it('⛔ 页面里查不到 border-style:dashed —— 这正是判据必须读 mask 的原因', async () => {
    // 记录性质：官方用「实色块 + 虚线遮罩」画那圈框，而不是 border。若哪天官方改成真 border，
    // 本判据会失效，这条会提醒后来者去更新判定。
    const { readFile } = await import('node:fs/promises')
    const css = await readFile(new URL('../src/glass.ts', import.meta.url), 'utf8')
    assert.ok(!/border[^;]*dashed/u.test(css), '本插件自己不该画虚线边框（边界让回官方）')
  })

  it('⛔ 卸载必须取消尚未触发的探测帧（否则属性会被写回、永久残留）', async () => {
    // 回归守卫：`ctx.effect` 只跑它收集到的 disposer，**不会**替你取消已入队的 rAF。
    // 少了 cancelAnimationFrame 就会出现「变动入队 → 卸载 → 帧才到 → 把刚摘掉的
    // WORKSTART_ATTR 重新写回」——卸载后属性永久残留在 body 上。
    const { readFile } = await import('node:fs/promises')
    const src = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    assert.match(src, /let probeFrame = 0/u, 'rAF 句柄必须存下来')
    assert.match(src, /probeFrame = requestAnimationFrame\(/u, 'rAF 返回值必须赋给 probeFrame')
    assert.match(src, /cancelAnimationFrame\(probeFrame\)/u, '清理时必须取消该帧')
    // 取消与 observer.disconnect() 必须在**同一个** effect 的清理里
    const cleanup = src.slice(src.indexOf('dsh-theme-tone: workstart probe') - 700, src.indexOf('dsh-theme-tone: workstart probe'))
    assert.ok(cleanup.includes('observer.disconnect()'), '清理里要断开 observer')
    assert.ok(cleanup.includes('cancelAnimationFrame'), '同一个清理里要取消 rAF')
  })
})
