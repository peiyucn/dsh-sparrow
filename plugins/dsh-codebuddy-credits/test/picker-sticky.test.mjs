import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

/**
 * 模型选择器「分组标题吸顶」的**几何契约**（`src/client/CodeBuddyModelSelect.tsx`
 * 的 `ensurePickerStyles()`）。
 *
 * 这里读源码而不是渲染：本插件没有 client 侧 DOM 测试环境，样式是一串字符串常量。
 * 代价是改写法要跟着改断言 —— 有意取舍（宁可啰嗦，也不要这类回归再溜过去）。
 *
 * **为什么专门为这两条写测试**：2026-09-25 owner 报「滚动时只有分类标题该吸顶，
 * 而且不应该出现重叠」。当时线上跑的是一版把 `position: sticky` 放到了
 * `<section class="ccb-model-group">` 上的实现 —— 结果是前后两个 section **同时**
 * 吸顶、两条标题在同一个 top 上互相压住（真机实测重叠 12px）。
 * 这两条断言把「谁吸顶」「底走哪个 token」钉死。
 *
 * 第二条改过两次，两次都是 owner 当场否掉的：
 * ① 先加了不透明白底（无质感）→ owner：「把分类标题的背景色去掉，**有点突兀**」
 *    （底色比卡片亮一档，而且是**纯色平带**压在带颗粒的卡片上）；
 * ② 我照字面理解成「去掉背景」→ 改成半透明 → owner：「给修坏了又。又重叠了。
 *    **只是把那个背景去掉，不是变成透明的**」（行又透上来了）。
 * 最终口径 = **不透明**（必须挡住滚过去的行）**且**与卡片同配方（不成带）：
 * background-color 打不透明底，菜单色作为**图层**叠上去，质感由主题插件在
 * 两处标题（我们的 + 官方 ModelSelect）一起补。
 */
const SOURCE = new URL('../src/client/CodeBuddyModelSelect.tsx', import.meta.url)
const source = await readFile(SOURCE, 'utf8')

/** 取出样式表里某个类名的规则体（选择器全等匹配，取最后一条）。 */
function ruleFor(className) {
  const at = source.indexOf(`'.${className} {`)
  assert.ok(at >= 0, `样式表里找不到 .${className} 规则`)
  const end = source.indexOf("'", at + 1)
  const raw = source.slice(at + 1, end)
  const open = raw.indexOf('{')
  return { selector: raw.slice(0, open).trim(), body: raw.slice(open + 1, raw.lastIndexOf('}')) }
}

describe('模型选择器：分组标题吸顶（几何契约）', () => {
  it('sticky 应该 挂在标题上，而不是分组容器上', () => {
    // ⚠️ 这是本轮回归的核心。sticky 的包含块是**最近的滚动祖先**（.ccb-model-groups），
    // section 只是滑动边界；把 sticky 放到 section 上会让相邻两个 section 同时吸顶，
    // 两条标题叠在同一个 top 上（owner 截图里的 "Hy4 preview"/"Hy3" 叠字）。
    const title = ruleFor('ccb-model-groupTitle')
    assert.match(title.body, /position:\s*sticky/u, '标题必须是 sticky —— 只有它该吸顶')
    assert.match(title.body, /top:\s*0/u, '吸顶位置 top: 0')
    assert.ok(/z-index:\s*1/u.test(title.body), '标题要盖在滚过的行上面')

    // 分组容器**不得**吸顶：它一旦 sticky，前一个 section 的底边还在口沿之下时
    // 仍保持吸顶，同时后一个 section 的顶边也开始吸顶 → 两条标题重叠。
    const groupAt = source.indexOf("'.ccb-model-group {")
    assert.equal(groupAt, -1, '.ccb-model-group 不该有独立规则（它必须留在文档流里当滑动边界）')
    const marginRule = ruleFor('ccb-model-group + .ccb-model-group')
    assert.ok(
      !/position:\s*sticky/u.test(marginRule.body),
      '分组容器不得 sticky —— 那会让相邻两组标题同时在顶部叠住',
    )
  })

  it('标题底必须 **不透明**，且与卡片同配方（不是变成透明）', () => {
    const title = ruleFor('ccb-model-groupTitle')
    // ⚠️ 这一条被 owner 当场否过一次，别再改成半透明：把 background-color 换成
    // `var(--dsw-specific-menu)`（理由是"官方也这么写"）→ 行立刻从标题底下透上来
    // （owner：「给修坏了又。又重叠了。**只是把那个背景去掉，不是变成透明的**」）。
    // 官方能那么写，是因为它那层半透明填充**叠在卡片填充之上**；我们一旦只留半透明，
    // 标题区域就比卡片主体少一层 —— 底下的行直接显形。
    assert.match(
      title.body,
      /background-color:\s*var\(--dsw-alias-bg-base\)/u,
      '标题要有**不透明**地面色打底（挡住滚过去的行）；透明化就是 owner 否掉的那版',
    )
    // 菜单色调留在**图层**上（与主题层同源、跟随色调），不能改成不透明色写死。
    assert.match(
      title.body,
      /background-image:\s*linear-gradient\(var\(--dsw-specific-menu\)/u,
      '菜单色调要叠在不透明底之上（走 token，跟随色调）',
    )
    // 「有点突兀」的成因是**底色的算式与卡片不同**，而不是透明度：
    // 卡片 = 菜单填充叠在**被模糊过的真实页面**上再吃一层颗粒；本条当时叠在纯白上且没有颗粒。
    // 缺的那层颗粒由主题插件补给**两处标题**（我们的 + 官方 ModelSelect），见
    // dsh-theme-tone 的 surface.ts —— 这样卡片与标题同配方，带子就没了。
    // 不得用 background 简写：它会把主题层可能加到这条上的 background-image 一起重置。
    assert.ok(
      !/(?:^|;)\s*background:\s/u.test(title.body),
      '不得用 background 简写（会重置主题层叠加的 background-image）',
    )
    // 不得声明 backdrop-filter：标题在菜单内部，菜单自己已是 backdrop root，
    // 再声明模糊只会采样子树里滚动的行（实测反而更脏：31.719/px vs 19.885/px）。
    assert.ok(
      !/backdrop-filter/u.test(title.body),
      '标题不得声明 backdrop-filter（会采样到滚动的行，反而更脏）',
    )
  })

  it('标题应该 切同心圆角（和菜单一致），但**不得**因此变透明', () => {
    // owner 第五轮：「能否官方原样，但把这个条变成圆角的，和菜单的圆角一致」。
    //
    // 几何：本菜单 `border-radius: 20px` + `padding: 4px` ⇒ 同心内圆角 = **16px**
    // = `--dsw-radius-lg`（真机读到该 token 就是 16px），也**正是官方菜单自己的圆角 token**
    // （`ui-primitives/MenuSurface.module.css:3` 的 `.surface { border-radius: var(--dsw-radius-lg) }`）。
    //
    // 切圆要治的是**下沿那道横贯全宽的直边** —— 它才是"看着像一条背景条"的来源
    // （上两角本来就被菜单的 `overflow: hidden` + 20px 圆角切掉了，加了也看不见）。
    const title = ruleFor('ccb-model-groupTitle')
    assert.match(
      title.body,
      /border-radius:\s*var\(--dsw-radius-lg/u,
      '标题要切同心圆角，且走官方菜单自己的圆角 token（不写死像素）',
    )
    // ⚠️ 切圆**不是**把底变透明：这两条必须同时成立，否则就又回到 owner 否掉的那版。
    assert.match(
      title.body,
      /background-color:\s*var\(--dsw-alias-bg-base\)/u,
      '切圆之后底必须仍然不透明（owner：「不是变成透明的」）',
    )
    // 真机滚动差分（0.1.7）：切圆前后标题带逐像素不变（不透明 ⇒ 挡住滚过的行）。
    // 若哪天有人"顺手"把底改成半透明去配圆角，上面那条断言会先拦住。
  })
})
