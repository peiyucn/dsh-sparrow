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
 * 这两条断言把「谁吸顶」「底要不透明」钉死。
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

  it('标题底应该 **不透明** —— 半透明会让滚过的行透上来（"重叠"）', () => {
    const title = ruleFor('ccb-model-groupTitle')
    // 必须有不透明的底色（background-color），而不是只有半透明菜单色。
    assert.match(
      title.body,
      /background-color:\s*var\(--dsw-alias-bg-base\)/u,
      '标题要有不透明地面色打底；官方那版只有半透明 --dsw-specific-menu，行会透出来',
    )
    // 菜单色调保留在**图层**上（与主题层同源、跟随色调），不能改成不透明色写死。
    assert.match(
      title.body,
      /background-image:\s*linear-gradient\(var\(--dsw-specific-menu\)/u,
      '菜单色调要叠在不透明底之上（走 token，跟随色调）',
    )
    // 不得用 background 简写：它会把主题层可能加到这条上的 background-image 一起重置。
    assert.ok(
      !/(?:^|;)\s*background:\s/u.test(title.body),
      '不得用 background 简写（会重置主题层叠加的 background-image）',
    )
    // 不得声明 backdrop-filter：标题在菜单内部，菜单自己已是 backdrop root，
    // 再声明模糊只会采样子树里滚动的行（实测反而更脏）。
    assert.ok(
      !/backdrop-filter/u.test(title.body),
      '标题不得声明 backdrop-filter（会采样到滚动的行，反而更脏）',
    )
  })
})
