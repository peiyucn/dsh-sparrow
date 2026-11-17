
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { CHAT_FIM_CLASS, buildChatFimCss } from '../lib/client/styles.js'
import { RING_THICKNESS, RING_Z_INDEX } from '../lib/constants.js'


const css = buildChatFimCss()


function ruleOf(selector) {
  const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'u').exec(css)
  assert.ok(match !== null, `应当存在 ${selector} 规则`)
  return match[1]
}


function expectDeclarations(block, snippets, where) {
  for (const snippet of snippets) {
    assert.ok(block.includes(snippet), `${where} 缺少声明「${snippet}」`)
  }
}


const domSource = async () => {
  const dir = new URL('../src/client/', import.meta.url)
  const files = (await readdir(dir)).filter(name => name.endsWith('.tsx')).sort()
  const sources = await Promise.all(files.map(name => readFile(new URL(name, dir), 'utf8')))
  return sources.join('\n')
}

describe('chat-fim 菜单样式契约（对齐官方 rc.3 菜单原语）', () => {
  it('注入样式表的花括号必须平衡（多余的 } 会吞掉下一条规则）', () => {
    let depth = 0
    let minDepth = 0
    for (const char of css) {
      if (char === '{') depth += 1
      else if (char === '}') {
        depth -= 1
        minDepth = Math.min(minDepth, depth)
      }
    }
    assert.equal(minDepth, 0, '不得出现多余的右花括号')
    assert.equal(depth, 0, '样式表结尾不得留下未闭合的规则块')
  })

  it('候选菜单卡由官方 MenuSurface 承担材质，卡片规则只留几何与立起方式', async () => {
    assert.match(await domSource(), /<MenuSurface\s/u, '候选菜单卡必须由官方 MenuSurface 渲染')
    const card = ruleOf(`.${CHAT_FIM_CLASS.menu}`)
    expectDeclarations(card, [
      'position: absolute',
      'bottom: calc(100% + 4px)',
      'left: 0',
      'right: 0',
      'box-sizing: border-box',
      'padding: 4px',
      'border: 0',
      '--dsw-elevation-stroke-color: var(--dsw-alias-border-l1)',
      'box-shadow: var(--dsw-elevation-prominent)',
    ], '候选菜单卡')
    assert.ok(!card.includes('backdrop-filter'), '卡片不得自写 backdrop-filter（材质在 .material 子层）')
    assert.ok(!/(^|[^-])background:/u.test(card), '卡片不得自写填充（材质在 .material 子层）')
    assert.ok(!card.includes('button-info-fill'), '卡片不得再用旧版紫色描边，统一走官方描边通道')
  })

  it('候选行与官方 MenuView .item 同几何：34 高 / 6×8 内边距 / md 圆角 / 13-20 字', () => {
    const row = ruleOf(`.${CHAT_FIM_CLASS.menuRow}`)
    expectDeclarations(row, [
      'box-sizing: border-box',
      'width: 100%',
      'min-height: 34px',
      'padding: 6px 8px',
      'border-radius: var(--dsw-radius-md)',
      'font-size: 13px',
      'line-height: 20px',
      'background: transparent',
    ], '候选行')
    const hover = ruleOf(`.${CHAT_FIM_CLASS.menuRow}:hover`)
    assert.ok(hover.includes('background: var(--dsw-alias-interactive-bg-hover)'), '悬停底必须用官方高亮 token')
  })

  it('FIM 开关胶囊与官方 PermissionSelect / ModelSelect 触发器同几何（hover 底形状一致）', () => {


    const sw = ruleOf(`.${CHAT_FIM_CLASS.switch}`)
    expectDeclarations(sw, [
      'height: 28px',
      'padding: 0 4px 0 8px',
      'border-radius: var(--dsw-radius-sm)',
      'gap: 4px',
      'font-size: 13px',
      'line-height: 20px',
    ], 'FIM 开关胶囊')
    assert.ok(!sw.includes('border-radius: 24px'), '不得再用 24px 胶囊圆角（hover 底会被裁成椭圆）')
    const hover = ruleOf(`.${CHAT_FIM_CLASS.switch}:hover:not(:disabled)`)
    assert.ok(hover.includes('background: var(--dsw-alias-interactive-bg-hover)'), '悬停底必须与官方触发器同 token')
  })

  it('转动环与 composer 卡片同心：外圆角 = 官方卡片圆角 token + 环厚（四角不留缝）', () => {
    const ring = ruleOf(`.${CHAT_FIM_CLASS.ring}`)
    expectDeclarations(ring, [
      'position: fixed',
      `padding: ${RING_THICKNESS}px`,
      `border-radius: calc(var(--dsw-radius-panel, 28px) + ${RING_THICKNESS}px)`,
      'pointer-events: none',
    ], '转动环')
    assert.ok(ring.includes(`z-index: ${RING_Z_INDEX}`), '环的层级必须保持（低于官方遮罩）')
    assert.ok(!ring.includes('border-radius: 24px'), '不得再写死 24px 圆角：卡片是 --dsw-radius-panel（28px），四角会露缝')
  })

  it('菜单底部沿用官方菜单 footer 的 l2 发丝线，且不再有品牌行', async () => {
    const footer = ruleOf(`.${CHAT_FIM_CLASS.menuFooter}`)
    assert.ok(footer.includes('border-top: 0.5px solid var(--dsw-alias-border-l2)'), '底部发丝线用 l2')

    assert.ok(footer.includes('justify-content: flex-end'), '品牌行移除后 footer 内容靠右')
    assert.ok(!('menuBrand' in CHAT_FIM_CLASS), '类名表里不再保留 menuBrand')
    assert.ok(!css.includes('dsh-chat-fim-menu-brand'), '样式表里不再保留品牌行规则')
    assert.ok(!(await domSource()).includes('dsh-sparrow'), '候选菜单组件不得再输出 dsh-sparrow 品牌文字')
  })

  it('灵敏度弹层同样走官方 MenuSurface + 官方行几何，左缘对齐开关', async () => {
    const source = await domSource()
    assert.match(source, /className=\{cls\.sensitivityPopover\}/u, '灵敏度弹层必须由官方 MenuSurface 渲染')
    const popover = ruleOf(`.${CHAT_FIM_CLASS.sensitivityPopover}`)
    expectDeclarations(popover, [
      'position: fixed',
      'z-index: 1100',
      'padding: 4px',
      'border: 0',
      '--dsw-elevation-stroke-color: var(--dsw-alias-border-l1)',
      'box-shadow: var(--dsw-elevation-prominent)',
    ], '灵敏度弹层卡')
    assert.ok(!popover.includes('backdrop-filter'), '弹层不得自写 backdrop-filter')
    const option = ruleOf(`.${CHAT_FIM_CLASS.sensitivityOption}`)
    expectDeclarations(option, [
      'min-height: 34px',
      'padding: 6px 8px',
      'border-radius: var(--dsw-radius-md)',
      'font-size: 13px',
      'line-height: 20px',
    ], '灵敏度选项行')
    assert.match(source, /const x = Math\.max\(8, Math\.min\(rect\.left,/u, '弹层左缘对齐开关并做窗内钳制')
    assert.ok(!source.includes('translateX(-100%)'), '弹层不得再右缘对齐')
  })
})
