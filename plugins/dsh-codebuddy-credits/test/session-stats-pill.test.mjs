import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

/**
 * 会话积分胶囊与官方 `StatsPills` 的**外观契约**
 * （`src/client/CodeBuddyCreditsStats.tsx` 的 `ensureStatsStyles()`）。
 *
 * 这里读源码而不是渲染：本插件没有 client 侧 DOM 测试环境，样式是一串字符串常量
 * ——与 `picker-sticky.test.mjs` 同一取舍（宁可啰嗦，也不要这类回归再溜过去）。
 *
 * **为什么专门为它写测试**：2026-09-29 owner 报「输入框下面几个胶囊，圆角角度居然
 * 不一样」。实测根因有两条，**都不是我们写错，而是我们停在旧官方口径上**：
 *
 * 1. **圆角**：官方 `0.1.5-rc.2` 与 `0.1.7-rc.1` 的 `.pill` 是 `24px`，本插件照它写；
 *    官方在 **`0.1.7-rc.2`（commit `fdd14a0989`）改成 `999px`**（全胶囊），我们没跟。
 * 2. **字号 / 行高**：官方胶囊自己不设字号行高，靠外层 `.root` 提供
 *    （`12/20`）。我们挂在 `conversation.composer.dock`、**不在那个 `.root` 里**
 *    （`.dock` 自己不设字号行高），`font: inherit` 拿到的是更大的字 ⇒
 *    胶囊比官方那两颗高一档，看上去的「圆角角度」也随之不同。
 *
 * 于是断言分两组：**圆角必须与官方同形**、**字号行高必须自己补齐且不得被简写重置**。
 */
const SOURCE = new URL('../src/client/CodeBuddyCreditsStats.tsx', import.meta.url)
const source = await readFile(SOURCE, 'utf8')

/** 源码里 `const PILL_X = '...'` 形式的样式常量（本文件用单引号）。 */
const constants = Object.fromEntries(
  [...source.matchAll(/const\s+(PILL_[A-Z_]+)\s*=\s*'([^']*)'/gu)].map(m => [m[1], m[2]]),
)

/**
 * 把 `ensureStatsStyles()` 里 `style.textContent = [...]` 那个数组**还原成一份 CSS 文本**
 * （逐项取字符串，单引号与模板字符串都认，并把 `${PILL_*}` 占位换成常量值）。
 */
function injectedCss() {
  const start = source.indexOf('style.textContent = [')
  assert.ok(start >= 0, '样式表数组不见了（ensureStatsStyles 被改写？）')
  const end = source.indexOf('].join(', start)
  assert.ok(end > start, '样式表数组的 ].join 不见了')
  const block = source.slice(start, end)
  return [...block.matchAll(/['`]([^'`]*)['`]/gu)]
    .map(m => m[1].replace(/\$\{(\w+)\}/gu, (_, name) => constants[name] ?? `\${${name}}`))
    .join('\n')
}

/** 取某选择器的规则体（本文件的选择器都没有嵌套块）。 */
function ruleBody(css, selector) {
  const at = css.indexOf(`${selector} {`)
  assert.ok(at >= 0, `注入的 CSS 里找不到 "${selector}" 规则`)
  const open = css.indexOf('{', at)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

const css = injectedCss()
const declaration = (body, property) => {
  const m = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'u').exec(body)
  return m ? m[1].trim() : null
}

describe('会话积分胶囊：与官方 StatsPills 的外观契约', () => {
  const pill = ruleBody(css, '.ccb-session-stats-pill')

  it('圆角必须是官方的全胶囊 999px，且不得残留旧的 24px', () => {
    assert.equal(
      declaration(pill, 'border-radius'),
      '999px',
      '圆角要跟官方 .pill 的 999px（官方 0.1.7-rc.2 起；24px 是 0.1.5 线的旧值）',
    )
    assert.ok(!/border-radius:\s*24px/u.test(pill), '不得再出现 24px（那是停在旧官方口径的写法）')
    assert.equal(
      declaration(pill, 'corner-shape'),
      'round',
      'corner-shape 也要跟官方 .pill 一起声明',
    )
  })

  it('字号 / 行高必须自己补齐为官方 .root 的那组值（我们不在 .root 里）', () => {
    assert.equal(
      declaration(pill, 'font-size'),
      'calc(var(--dsh-content-font-size-secondary, 13px) - 1px)',
      '字号要抄官方 .root 的 calc（官方 .pill 自己不设字号，靠 .root 提供）',
    )
    assert.equal(
      declaration(pill, 'line-height'),
      'calc(20px + var(--dsh-content-font-delta-secondary, 0px))',
      '行高要抄官方 .root 的 calc',
    )
  })

  it('⛔ font 简写必须排在 font-size / line-height 之前（否则会被重置回 inherit）', () => {
    // `font: inherit` 会重置 font-size 与 line-height —— 顺序反了这两条就静默失效，
    // 又回到「胶囊比官方高一档」的老样子，而且没有任何视觉以外的东西能发现它。
    const shorthand = pill.indexOf('font: inherit')
    const size = pill.indexOf('font-size:')
    const line = pill.indexOf('line-height:')
    assert.ok(shorthand >= 0, '胶囊仍然要有 font: inherit（字族 / 字重跟官方）')
    assert.ok(size > shorthand, 'font-size 必须排在 font: inherit 之后')
    assert.ok(line > shorthand, 'line-height 必须排在 font: inherit 之后')
  })

  it('保持与官方一致的其余锚点（内边距 / 文案色 / 图标尺寸）', () => {
    assert.equal(declaration(pill, 'padding'), '1px 8px', '内边距与官方 .pill 一致')
    assert.equal(
      declaration(pill, 'color'),
      'var(--dsw-alias-label-tertiary)',
      '文案色为官方 tertiary 档',
    )
    assert.equal(declaration(pill, 'gap'), '6px', '图标与文字的间距与官方一致')
    const icon = ruleBody(css, '.ccb-session-stats-pill svg')
    assert.equal(declaration(icon, 'width'), '14px', '官方 .pill svg 是 14px')
    assert.equal(declaration(icon, 'height'), '14px', '官方 .pill svg 是 14px')
  })
})
