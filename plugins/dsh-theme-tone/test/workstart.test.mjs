// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isDashedRing, isWorkstartProbe, rendersContent } from '../lib/workstart.js'

/** 官方 ::after 那条 mask 的原样内联 SVG（判定基准）。 */
const OFFICIAL_DASHED_MASK =
  'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\'%3E%3Crect width=\'100%25\' ' +
  'height=\'100%25\' fill=\'none\' rx=\'22\' ry=\'22\' stroke=\'black\' stroke-width=\'2\' ' +
  'stroke-dasharray=\'4 4\'/%3E%3C/svg%3E")'

describe('workstart：未选工作区待启动态的判定（纯函数）', () => {
  it('rendersContent 应该 认 content:"" 为「在渲染」、认 none/normal/空 为「没渲染」', () => {
    // content:"" 算「在渲染」——官方那条正是它，不能判成 false。
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
    assert.equal(
      isWorkstartProbe({ content: 'none', maskImage: OFFICIAL_DASHED_MASK, webkitMaskImage: '' }),
      false,
      'content:none 时即便 mask 偶然带 dasharray 也不算',
    )
    // 普通态其它插件也用 ::after 遮罩，故 mask 存在不足以判定。
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
    // 官方用「实色块 + 虚线遮罩」而非 border 画框；官方改用真 border 则本判据失效。
    const { readFile } = await import('node:fs/promises')
    const css = await readFile(new URL('../src/glass.ts', import.meta.url), 'utf8')
    assert.ok(!/border[^;]*dashed/u.test(css), '本插件自己不该画虚线边框（边界让回官方）')
  })

  it('⛔ 卸载必须取消尚未触发的探测帧（否则属性会被写回、永久残留）', async () => {
    // ctx.effect 不会替你取消已入队的 rAF；不取消则卸载后帧才到，属性残留在 body 上。
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

  it('⛔ 流式输出必须被节流：结构探测有最小间隔，尾随定时器也要取消', async () => {
    // 官方在 thinking 时每帧都在往对话区插节点；不节流 = 每帧跑一次 getComputedStyle + 多次全文档扫描，
    // 与官方渲染抢主线程 ⇒ 滚动掉帧。这条守卫钉住「节流常量 + setTimeout 尾随 + 清理时 clearTimeout」。
    const { readFile } = await import('node:fs/promises')
    const src = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    assert.match(src, /const PROBE_MIN_INTERVAL_MS = \d+/u, '结构探测的最小间隔必须是具名常量')
    assert.match(src, /probeTimer = (window\.)?setTimeout\(/u, '未到最小间隔时要排尾随定时器而不是立刻跑')
    assert.match(src, /clearTimeout\(probeTimer\)/u, '清理时必须取消尾随定时器（否则卸载后仍会写属性）')
  })

  it('⛔ 相位重测必须分两条路：class 立即、childList（流式）走节流', async () => {
    // childList 变动在流式输出时每帧都有，而相位只在布局变化时才变；若 observer 对任何变动都
    // 立即 startPhaseSettle，就等于「思考全程每帧测几何」（0.2.1-rc.2 上的卡顿来源之一）。
    // 但也不能完全不管 childList（切会话会重建座位/卡片元素），所以它走节流入口做尾随重测。
    const { readFile } = await import('node:fs/promises')
    const src = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    assert.match(src, /const PHASE_SETTLE_MIN_INTERVAL_MS = \d+/u, '相位节流间隔必须是具名常量')
    assert.match(src, /const schedulePhaseSettle = \(\): void => \{[\s\S]{0,600}?phaseTimer = window\.setTimeout\(/u,
      'childList 路径要用尾随定时器节流，而不是每帧立即重测')
    assert.match(src, /if \(layoutChanged\) startPhaseSettle\(\)\s*\n\s*else schedulePhaseSettle\(\)/u,
      'class 变动立即重测、childList 走节流入口')
    assert.ok(!/maintainAnchors\(\)\s*\n\s*startPhaseSettle\(\)/u.test(src), '结构探测回调里不得无条件重测相位')
    const cleanup = src.slice(src.indexOf('dsh-theme-tone: workstart probe') - 1400, src.indexOf('dsh-theme-tone: workstart probe'))
    assert.ok(cleanup.includes('clearTimeout(phaseTimer)'), '清理时必须取消相位重测的尾随定时器')
    assert.ok(cleanup.includes('clearTimeout(contentSettleTimer)'), '清理时必须取消内容静默去抖定时器')
  })

  it('⛔ 流式内容变动必须推迟探测：内容量越大扫描越贵，不能每批变动都跑', async () => {
    // 实测：锚点扫描是**全文档** querySelectorAll，成本随会话 DOM 线性增长（3.4K 节点 ≈1.2ms、
    // 23K 节点 ≈9.5ms）；相位收敛重测还会强制样式/布局并连测多帧。流式输出时每帧都有 childList 变动，
    // 若照旧触发 ⇒ 长会话的 think 阶段把这两笔叠到每帧渲染上（owner 观察：内容一收起明显缓解）。
    const { readFile } = await import('node:fs/promises')
    const src = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    assert.match(src, /const CONTENT_SETTLE_QUIET_MS = \d+/u, '内容变动的静默去抖间隔必须是具名常量')
    // 判定先于 scheduleProbe：纯内容变动直接走推迟路径并 return。
    // ⚠️ 断言「调用形状」而非具体实现名：2026-10-21 起判定改走 `mutation-gate.ts` 的纯函数
    // （`isContentChurnByRecords`，带语义对拍与短路单测），调用点仍是「先分类、命中就 arm 并 return」。
    const churnGate = /if \(isContentChurnFast\(records\)\) \{ armContentSettle\(\); return \}/u
    assert.match(src, churnGate, 'observer 必须先用内容变动判定分类，内容变动走推迟路径')
    const gateAt = src.search(churnGate)
    const probeAt = src.indexOf('scheduleProbe()', src.indexOf('const observer = new MutationObserver'))
    assert.ok(gateAt > 0 && probeAt > gateAt, '内容变动分支必须在 scheduleProbe 之前 return')
    // 判定本身必须落在可单测的纯模块里，而不是埋在 observer 回调里。
    assert.match(src, /isContentChurnByRecords\(/u, '内容变动判定必须是纯函数（便于单测）')
    // 推迟路径：拿到变动只起 / 重排定时器；到点若仍在流式就不干活，安静后才补探测 + 相位重测。
    // ⚠️ 断言「语义」而不是某个字面量写法：2026-10-21 把轮询式去抖改成一次性重排，
    // 延时参数从常量变成计算值（quietAt 与上限取 min），语义没变、唤醒次数更少。
    assert.match(src, /const armContentSettle = \(\): void => \{[\s\S]{0,900}?contentSettleTimer = window\.setTimeout\(contentSettleFlush,/u,
      '内容变动只能起静默去抖定时器（流式期间不扫描）')
    assert.match(src, /const contentSettleFlush = \(\): void => \{[\s\S]{0,700}?scheduleProbe\(\)\s*\n\s*startPhaseSettle\(\)/u,
      '真正安静下来后必须补一次探测 + 相位重测')
    // 到点仍然吵 ⇒ 必须直接返回（不许退回「每批变动都探测」那条老路）。
    assert.match(src, /if \(performance\.now\(\) - lastContentMutationAt < CONTENT_SETTLE_QUIET_MS\) return/u,
      '到点仍在流式时必须直接返回，不得扫描')
    // 上限不可省：只按「最后变动 + 静默窗口」重排的话，持续流式时探测永不发生，
    // 切会话后相位会一直停在慢档（正确但更慢）。
    assert.match(src, /const CONTENT_SETTLE_MAX_WAIT_MS = \d+/u, '静默去抖必须有最长等待上限')
    assert.match(src, /Math\.min\(quietAt, capAt\)/u, '到点时刻必须取静默窗口与最长等待的较小值')
    assert.ok(src.includes("const ANCHOR_LIKE_SELECTOR ="), '需要锚点相关节点特征表来收窄内容变动判定')
  })
})
