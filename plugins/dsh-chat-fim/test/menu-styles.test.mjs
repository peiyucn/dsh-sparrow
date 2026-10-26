// @ts-check
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

/**
 * 取出 `ensureSuggestBusyStyles()` 注入的 CSS 文本。
 * @returns {Promise<{ css: string, source: string }>} CSS 文本与整个源文件文本。
 */
async function readInjectedCss() {
  const source = await readFile(new URL('../src/client/ChatFimDock.tsx', import.meta.url), 'utf8')
  const marker = 'style.textContent = `'
  const start = source.indexOf(marker)
  const tail = source.indexOf('document.head.appendChild(style)')
  assert.ok(start >= 0 && tail > start, '应当能在源注册处找到注入样式模板')
  const end = source.lastIndexOf('`', tail)
  assert.ok(end > start, '应当能找到注入样式模板的结束反引号')
  return { css: source.slice(start + marker.length, end), source }
}

/**
 * 取某个类选择器规则的声明块文本（只处理本文件的平铺规则，不含嵌套）。
 * @param {string} css - 注入的 CSS 文本。
 * @param {string} selector - 选择器（如 `.dsh-chat-fim-menu-row`）。
 * @returns {string} 规则内容。
 */
function ruleOf(css, selector) {
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

describe('chat-fim 菜单样式契约（对齐官方 rc.3 菜单原语）', () => {
  it('注入样式表的花括号必须平衡（多余的 } 会吞掉下一条规则）', async () => {
    const { css } = await readInjectedCss()
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
    const { css, source } = await readInjectedCss()
    assert.match(source, /<MenuSurface\s/u, '候选菜单卡必须由官方 MenuSurface 渲染')
    const card = ruleOf(css, '.dsh-chat-fim-menu')
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

  it('候选行与官方 MenuView .item 同几何：34 高 / 6×8 内边距 / md 圆角 / 13-20 字', async () => {
    const { css } = await readInjectedCss()
    const row = ruleOf(css, '.dsh-chat-fim-menu-row')
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
    const hover = ruleOf(css, '.dsh-chat-fim-menu-row:hover')
    assert.ok(hover.includes('background: var(--dsw-alias-interactive-bg-hover)'), '悬停底必须用官方高亮 token')
  })

  it('FIM 开关胶囊与官方 PermissionSelect / ModelSelect 触发器同几何（hover 底形状一致）', async () => {
    // owner 报障：「fim 按钮的 hover 背景框和官方的不一样」—— 官方触发器圆角走 --dsw-radius-sm（8px），
    // 我们曾写 24px 胶囊 ⇒ hover 底色被裁成「椭圆」。正文字由官方 trigger CSS 逐项对照钉住。
    const { css } = await readInjectedCss()
    const sw = ruleOf(css, '.dsh-chat-fim-switch')
    expectDeclarations(sw, [
      'height: 28px',
      'padding: 0 4px 0 8px',
      'border-radius: var(--dsw-radius-sm)',
      'gap: 4px',
      'font-size: 13px',
      'line-height: 20px',
    ], 'FIM 开关胶囊')
    assert.ok(!sw.includes('border-radius: 24px'), '不得再用 24px 胶囊圆角（hover 底会被裁成椭圆）')
    const hover = ruleOf(css, '.dsh-chat-fim-switch:hover:not(:disabled)')
    assert.ok(hover.includes('background: var(--dsw-alias-interactive-bg-hover)'), '悬停底必须与官方触发器同 token')
  })

  it('菜单底部沿用官方菜单 footer 的 l2 发丝线', async () => {
    const { css } = await readInjectedCss()
    const footer = ruleOf(css, '.dsh-chat-fim-menu-footer')
    assert.ok(footer.includes('border-top: 0.5px solid var(--dsw-alias-border-l2)'), '底部发丝线用 l2')
  })

  it('灵敏度弹层同样走官方 MenuSurface + 官方行几何，左缘对齐开关', async () => {
    const { css, source } = await readInjectedCss()
    assert.match(source, /<MenuSurface[\s\S]*?dsh-chat-fim-sensitivity-popover/u, '灵敏度弹层必须由官方 MenuSurface 渲染')
    const popover = ruleOf(css, '.dsh-chat-fim-sensitivity-popover')
    expectDeclarations(popover, [
      'position: fixed',
      'z-index: 1100',
      'padding: 4px',
      'border: 0',
      '--dsw-elevation-stroke-color: var(--dsw-alias-border-l1)',
      'box-shadow: var(--dsw-elevation-prominent)',
    ], '灵敏度弹层卡')
    assert.ok(!popover.includes('backdrop-filter'), '弹层不得自写 backdrop-filter')
    const option = ruleOf(css, '.dsh-chat-fim-sensitivity-option')
    expectDeclarations(option, [
      'min-height: 34px',
      'padding: 6px 8px',
      'border-radius: var(--dsw-radius-md)',
      'font-size: 13px',
      'line-height: 20px',
    ], '灵敏度选项行')
    assert.match(source, /const x = Math\.max\(8, Math\.min\(rect\.left,/u, '弹层左缘对齐开关并做窗内钳制')
    assert.ok(!source.includes("translateX(-100%)"), '弹层不得再右缘对齐')
  })
})
