import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

/**
 * 模型选择器「分组标题吸顶」的几何契约：本插件没有 client DOM 测试环境、样式是字符串常量，
 * 故读 `src/client/CodeBuddyModelSelect.tsx` 源码串断言 —— 改样式写法必须同步改这里。
 * 钉死三件事：谁吸顶、底怎么配方、圆角交给谁。
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
    // ⚠️ sticky 的包含块是最近的滚动祖先（.ccb-model-groups）：挂到 section 上会让相邻
    // 两组同时吸顶、两条标题叠在同一个 top 上 —— 别改回去。
    const title = ruleFor('ccb-model-groupTitle')
    assert.match(title.body, /position:\s*sticky/u, '标题必须是 sticky —— 只有它该吸顶')
    assert.match(title.body, /top:\s*0/u, '吸顶位置 top: 0')
    assert.ok(/z-index:\s*1/u.test(title.body), '标题要盖在滚过的行上面')

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
    // ⚠️ 别改成半透明：官方那层半透明填充是叠在卡片填充之上的，我们只留半透明就比卡片
    // 主体少一层 —— 滚过去的行会直接显形。
    assert.match(
      title.body,
      /background-color:\s*var\(--dsw-alias-bg-base\)/u,
      '标题要有**不透明**地面色打底（挡住滚过去的行）；透明化就是 owner 否掉的那版',
    )
    // 菜单色调留在图层上（跟随主题色调），不能写成不透明色。
    assert.match(
      title.body,
      /background-image:\s*linear-gradient\(var\(--dsw-specific-menu\)/u,
      '菜单色调要叠在不透明底之上（走 token，跟随色调）',
    )
    // 不得用 background 简写：它会重置主题层叠到这条上的 background-image（质感由
    // theme-tone 补给我们的与官方 ModelSelect 两处标题 —— 同配方才不成带）。
    assert.ok(
      !/(?:^|;)\s*background:\s/u.test(title.body),
      '不得用 background 简写（会重置主题层叠加的 background-image）',
    )
    // 不得声明 backdrop-filter：标题在菜单内部、菜单自己已是 backdrop root，再声明模糊
    // 只会采样子树里滚动的行，反而更脏。
    assert.ok(
      !/backdrop-filter/u.test(title.body),
      '标题不得声明 backdrop-filter（会采样到滚动的行，反而更脏）',
    )
  })

  it('圆角应该 交给**滚动容器**，标题自己保持方角（否则边缘会漏）', () => {
    // ⚠️ 标题自带圆角时「标题矩形 − 圆角」那块缺口真的没画，滚动的行会从缺口透出来；
    // 圆角必须交给滚动容器（容器顶角裁剪同时作用于标题与行），标题保持方角。
    const title = ruleFor('ccb-model-groupTitle')
    assert.match(
      title.body,
      /border-radius:\s*0(?:px)?\b/u,
      '标题必须方角 —— 它一旦有圆角，缺口就会把滚动的行露出来（owner 第六轮）',
    )
    assert.ok(
      !/border-radius:\s*var\(--dsw-radius/u.test(title.body),
      '标题不得再切圆角（第五轮那版就是这么漏的）',
    )
    // 半径由 theme-tone 的容器规则读变量给出，本插件只声明变量：那条规则同时命中官方菜单
    // 与本菜单，半径写死会让其中一个的同心关系错掉；变量沿继承树下传，滚动容器是菜单后代。
    const menu = ruleFor('ccb-model-menu')
    assert.match(
      menu.body,
      /--dsh-theme-tone-menu-inner-radius:\s*var\(--dsw-radius-lg/u,
      '菜单要声明同心内圆角变量（外圆角 20 − 内边距 4 = 16px），供 theme-tone 的容器规则读取',
    )
    // 本插件不得自己给容器写圆角：会与 theme-tone 那条撞车（两条都 !important）。
    const groupsAt = source.indexOf("'.ccb-model-groups {")
    if (groupsAt >= 0) {
      const groupsRaw = source.slice(groupsAt + 1, source.indexOf("'", groupsAt + 1))
      assert.ok(
        !/border-radius/u.test(groupsRaw),
        '本插件不得自己给滚动容器写 border-radius —— 同心半径由 theme-tone 那条统一施加',
      )
    }
    // ⚠️ 切圆不等于放透明底：两条必须同时成立。
    assert.match(
      title.body,
      /background-color:\s*var\(--dsw-alias-bg-base\)/u,
      '切圆之后底必须仍然不透明（owner：「不是变成透明的」）',
    )
  })
})
