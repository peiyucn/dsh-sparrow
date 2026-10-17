import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

/**
 * 会话积分胶囊的外观 / 落点契约（`src/client/CodeBuddyCreditsStats.tsx`）：无 client 侧 DOM 测试环境、
 * 样式是一串字符串常量，故读源码断言。外观对齐官方 rc.2 `StatsPills.module.css`；落点由
 * `conversation.composer.dock` 的 list order 决定（本组件根节点直接是 `.dock` flex 子项），
 * 不再对官方统计行做 DOM portal / 重挂。
 */
const SOURCE = new URL('../src/client/CodeBuddyCreditsStats.tsx', import.meta.url)
const source = await readFile(SOURCE, 'utf8')

/** 去掉注释后的源码：注释里会引用官方旧锚点名称用于说明，不能当作代码断言对象。 */
const code = source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '')

/** 源码里 `const PILL_X = '...'` 形式的样式常量（本文件用单引号）。 */
const constants = Object.fromEntries(
  [...source.matchAll(/const\s+(PILL_[A-Z_]+)\s*=\s*'([^']*)'/gu)].map(m => [m[1], m[2]]),
)

/** 把 `style.textContent = [...]` 数组还原成一份 CSS 文本（`${PILL_*}` 换成常量值）。 */
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

  it('圆角必须是官方 rc.2 的紧凑控件档 --dsw-radius-sm（R8），不得残留旧口径', () => {
    assert.equal(
      declaration(pill, 'border-radius'),
      'var(--dsw-radius-sm)',
      '圆角要跟官方 .pill 的紧凑控件档 R8（StatsPills.module.css:21）；999px 是 0.1.7 线的旧口径',
    )
    assert.ok(
      !/border-radius:\s*(?:999px|24px)/u.test(pill),
      '不得再出现 999px / 24px（那都是停在旧官方口径的写法）',
    )
    assert.equal(
      declaration(pill, 'corner-shape'),
      null,
      '官方 .pill 不自己声明 corner-shape —— 圆角曲线由 ui-theme 的全局 corner-shape 规则统一施加，'
        + '这里写死 round 会与官方胶囊曲率不一致',
    )
    assert.ok(!/corner-shape/u.test(css), '注入的 CSS 里不得再出现 corner-shape')
  })

  it('字号 / 行高必须自己补齐为官方 .anchor 的那组值（我们不在 .anchor 里）', () => {
    assert.equal(
      declaration(pill, 'font-size'),
      'calc(var(--dsh-content-font-size-secondary, 13px) - 1px)',
      '字号要抄官方 .anchor 的 calc（官方 .pill 自己不设字号，靠 .anchor 提供）',
    )
    assert.equal(
      declaration(pill, 'line-height'),
      'calc(20px + var(--dsh-content-font-delta-secondary, 0px))',
      '行高要抄官方 .anchor 的 calc',
    )
    assert.ok(
      !/外层 \.root/u.test(source),
      '过期注释要同步：官方外层类名已从 .root 改为 .anchor，别再写 .root',
    )
  })

  it('⛔ font 简写必须排在 font-size / line-height 之前（否则会被重置回 inherit）', () => {
    // 顺序反了这两条就静默失效（font: inherit 会重置 font-size / line-height）。
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

describe('会话积分胶囊：落点契约（rc.2 槽位 list entry，不再 DOM portal）', () => {
  it('组件根节点就是胶囊本身（`.dock` 的 flex 子项），顺序交给槽位 order', () => {
    assert.match(
      code,
      /className="ccb-session-stats-pill"/u,
      '胶囊按钮必须是组件自己的根节点，才能作为 .dock 的 flex 子项渲染',
    )
    assert.ok(
      !/holderRef|ROW_SELECTOR|DOCK_SELECTOR/u.test(code),
      '旧的 hidden holder / 官方行选择器 / 重挂逻辑必须删干净（rc.2 起 data-composer-stats 已删除）',
    )
    assert.ok(
      !/data-composer-stats|data-composer-dock/u.test(code),
      '落点不再按官方 DOM 锚点寻址：由 conversation.composer.dock 的 list entry 顺序决定',
    )
    assert.ok(
      !/querySelector\(|closest\(/u.test(code),
      '组件内不得再解析 / 劫持官方 DOM',
    )
  })

  it('弹层仍 portal 到 body（只有这一处 createPortal）', () => {
    const portals = [...source.matchAll(/createPortal\(/gu)]
    assert.equal(portals.length, 1, '只允许弹层一处 createPortal')
    assert.ok(
      /document\.body/u.test(source),
      '弹层挂到 document.body，避免被输入区裁切',
    )
  })
})
