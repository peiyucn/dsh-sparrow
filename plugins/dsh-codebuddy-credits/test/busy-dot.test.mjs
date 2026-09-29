import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

/**
 * 本插件的**加载态**必须是「官方转圈」，不得退回纯文字。
 *
 * ## 为什么有这条测试
 *
 * owner 2026-09-30：「codebuddy 插件的额度卡片，现在还是 loading 纯文字，是不是也改成转圈？」
 * 查下来本插件有 **3 处**纯文字 loading，文案键还不一样（`picker.trigger.loading` /
 * `indicator.loading` / `picker.status.loading`），散在 3 个文件里。
 * 已统一到 `src/client/BusyDot.tsx`（光秃秃一个 `StateDot(state="ongoing")`，文案走 `aria-label`）。
 *
 * 本插件没有 client 侧 DOM 测试环境，故按源码结构断言 —— 与 `session-stats-pill.test.mjs`、
 * `picker-sticky.test.mjs` 同一取舍。判据是**「那几个 loading 文案不再被当作可见文本渲染」**：
 * 只要有人写成 `>…loading')}<`（顶层文本子节点）这条就会红。
 */
const CLIENT = new URL('../src/client/', import.meta.url)
const read = (name) => readFile(new URL(name, CLIENT), 'utf8')

/** 三个曾用纯文字的位置（文件 → 文案键）。 */
const TEXT_LOADING_SITES = [
  ['CodeBuddyCreditsCard.tsx', '\'picker.trigger.loading\''],
  ['CodeBuddyCreditsIndicator.tsx', '\'indicator.loading\''],
  ['CodeBuddyModelSelect.tsx', '\'picker.status.loading\''],
]

describe('codebuddy-credits：加载态只给转圈、不给纯文字', () => {
  it('BusyDot 应该 用官方 StateDot 且自带无障碍名称', async () => {
    const src = await read('BusyDot.tsx')
    assert.match(src, /import \{ StateDot \} from '@deepseek-ai\/dsh-client-ui-primitives'/u,
      'BusyDot 必须直接用官方 StateDot（不自画几何）')
    assert.match(src, /state="ongoing"/u, '用官方 ongoing（圆弧 spinner）那一档')
    assert.match(src, /role="status"/u, '容器带 role=status')
    assert.match(src, /aria-label=\{label\}/u, '文案挂在 aria-label 上（读屏器仍会念）')
  })

  it('⛔ 三处 loading 不得再作为可见文本渲染（必须包在 BusyDot 里）', async () => {
    for (const [file, key] of TEXT_LOADING_SITES) {
      const src = await read(file)
      // 允许出现文案键（作为 BusyDot 的 label 参数），但**不得**出现在标签体里：
      // 形如 `>…{t('xxx.loading')}…<` 的可见文本节点。
      const asVisibleText = new RegExp(`>[^<]*\\{\\s*t\\(\\s*${key.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\s*\\)`, 'u')
      assert.ok(!asVisibleText.test(src), `${file} 里 ${key} 又被当成可见文字渲染了（应改为 <BusyDot label={…} />）`)
      assert.ok(src.includes(`<BusyDot label={t(${key})}`) || src.includes(`<BusyDot label={t(${key})}`),
        `${file} 应该用 <BusyDot label={t(${key})} /> 呈现加载态`)
    }
  })

  it('⛔ 不得为了转圈去覆盖官方配色（官方 .spinner 自带中性灰）', async () => {
    const src = await read('BusyDot.tsx')
    // 允许 style 传递布局（字号/行高对齐调用点），但不得写 color / background
    const styleBlock = /style=\{\{([\s\S]*?)\}\}/u.exec(src)
    assert.ok(styleBlock !== null, 'BusyDot 的 style 找不到')
    assert.ok(!/\bcolor\s*:/u.test(styleBlock[1]), 'BusyDot 不应覆盖 color（官方 .spinner 自带 --dsw-alias-label-tertiary）')
    assert.ok(!/\bbackground/u.test(styleBlock[1]), 'BusyDot 不应加背景')
  })
})
