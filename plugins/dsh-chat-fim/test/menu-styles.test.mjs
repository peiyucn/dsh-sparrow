// @ts-check
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { CHAT_FIM_CLASS, buildChatFimCss } from '../lib/client/styles.js'

/** 注入的样式表文本（直接取构建产物，不再从 TSX 源码里切）。 */
const css = buildChatFimCss()

/** 取某个类选择器规则的声明块文本（只处理平铺规则，不含嵌套）。 */
function ruleOf(selector) {
  const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'u').exec(css)
  assert.ok(match !== null, `应当存在 ${selector} 规则`)
  return match[1]
}

/**
 * 逐条断言声明块内含给定片段。
 * @param {string} block - 规则内容。
 * @param {readonly string[]} snippets - 期望片段。
 * @param {string} where - 出错时的定位说明。
 */
function expectDeclarations(block, snippets, where) {
  for (const snippet of snippets) {
    assert.ok(block.includes(snippet), `${where} 缺少声明「${snippet}」`)
  }
}

/** 组件源码合订（只用来钉「由官方原语渲染」这类 JSX 事实，不从这里取 CSS）。 */
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
    // owner 报障：「fim 按钮的 hover 背景框和官方的不一样」—— 官方触发器圆角走 --dsw-radius-sm（8px），
    // 我们曾写 24px 胶囊 ⇒ hover 底色被裁成「椭圆」。正文字由官方 trigger CSS 逐项对照钉住。
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

  it('菜单底部沿用官方菜单 footer 的 l2 发丝线', () => {
    const footer = ruleOf(`.${CHAT_FIM_CLASS.menuFooter}`)
    assert.ok(footer.includes('border-top: 0.5px solid var(--dsw-alias-border-l2)'), '底部发丝线用 l2')
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
