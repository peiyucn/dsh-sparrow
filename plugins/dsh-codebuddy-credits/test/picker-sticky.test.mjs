// @ts-check
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

/**
 * 模型选择器「分组标题吸顶」契约：本插件没有 client DOM 测试环境、样式是字符串常量，
 * 故读 `src/client/CodeBuddyModelSelect.tsx` 源码串断言 —— 改写法必须同步改这里。
 *
 * ⚠️ 2026-10-26 重写：分组标题**改由官方 `MenuGroup` 原语承担**（rc.3 的 `data-menu-group-heading`
 * + 1×1 观测哨兵 + `observeStickyMenuGroups`），标题「非吸顶透明、吸顶才上官方底色」。
 * 旧实现是自绘 `.ccb-model-groupTitle`（**永远不透明 + 一层 --dsw-specific-menu 渐变**），
 * 在官方默认档下看着就是「被插件改过的一条实心横条」—— owner 报障后删掉。
 */
const SOURCE = new URL('../src/client/CodeBuddyModelSelect.tsx', import.meta.url)
const source = await readFile(SOURCE, 'utf8')

/** 取出样式表里某个类名的规则体（选择器全等匹配）。 */
function ruleFor(className) {
  const at = source.indexOf(`'.${className} {`)
  assert.ok(at >= 0, `样式表里找不到 .${className} 规则`)
  const end = source.indexOf("'", at + 1)
  const raw = source.slice(at + 1, end)
  const open = raw.indexOf('{')
  return { selector: raw.slice(0, open).trim(), body: raw.slice(open + 1, raw.lastIndexOf('}')) }
}

describe('模型选择器：分组标题（交给官方 MenuGroup 原语）', () => {
  it('应该 用官方 MenuGroup 渲染分组，并接上官方吸顶观测', () => {
    assert.match(source, /<MenuGroup\b/u, '分组必须用官方 MenuGroup（它负责标题结构 / 吸顶 / 透明-吸顶上色）')
    assert.match(source, /observeStickyMenuGroups\(/, '必须调用官方吸顶观测（否则 data-stuck 永远不会出现）')
    // 观测必须挂在真正滚动的容器上（:scope > [data-menu-group] 的直接结构）。
    assert.match(source, /ref=\{groupsRef\}/u, '滚动容器要有 ref 供 observeStickyMenuGroups 使用')
    assert.match(source, /useEffect\(\(\) => \{[\s\S]{0,400}?observeStickyMenuGroups\(viewport\)/u, '观测要放进 effect 并在 cleanup 里断开')
  })

  it('⛔ 不得再自绘分组标题（旧实现就是那条「实心横条」）', () => {
    assert.equal(source.indexOf("'.ccb-model-groupTitle {"), -1, '不得再声明 .ccb-model-groupTitle')
    assert.equal(source.indexOf("'.ccb-model-group {"), -1, '不得再声明 .ccb-model-group')
    assert.equal(source.indexOf("'.ccb-model-group + .ccb-model-group {"), -1, '分组间距交给原语（.group + .group）')
    // 也不得手写 section[role=group] + 标题（那会绕过原语的哨兵与吸顶观测）。
    assert.ok(!/role="group"/u.test(source), '不得手写 role="group" 的分组容器')
  })

  it('菜单 应该 是官方同款磨砂（半透明填充 + backdrop-filter），形状/底色交回官方', () => {
    // 2026-10-26：上一版为躲亮框改过实心配方；定位到亮框其实是 theme-tone 给 `[role='menu']` 叠的
    // `::after` 打光（已整条移出表面表）⇒ 恢复官方同款磨砂，与权限菜单 / FIM 档位菜单观感一致。
    const menu = ruleFor('ccb-model-menu')
    assert.match(menu.body, /background:\s*var\(--dsw-specific-menu\)/u, '半透明填充走官方菜单 token（可被 theme-tone 染色）')
    assert.match(menu.body, /backdrop-filter:\s*var\(--dsw-menu-backdrop-filter\)/u, '模糊走官方 token')
    // 禁止再出现「本地不透明底色 + 渐变叠加」那套实心替代（会把菜单染成另一块色）。
    assert.ok(!/background-color:\s*var\(--dsw-alias-bg-base\)/u.test(menu.body), '不得改用本地不透明底色')
  })

  it('菜单 不得再声明同心内圆角钩子变量（该族规则已随做减法删除）', () => {
    // ⚠️ 2026-10-26：theme-tone 的「分组菜单滚动容器切同心圆角」整族已交回官方，本插件不再声明钩子变量。
    const menu = ruleFor('ccb-model-menu')
    assert.ok(!/--dsh-theme-tone-menu-inner-radius/u.test(menu.body), '不得再声明已废弃的同心内圆角变量')
  })

  it('滚动容器 不得自己写 border-radius（会与 theme-tone 那条撞车）', () => {
    const groups = ruleFor('ccb-model-groups')
    assert.ok(!/border-radius/u.test(groups.body), '同心半径由 theme-tone 统一施加')
    assert.match(groups.body, /overflow-y:\s*auto/u, '滚动容器要自己滚（吸顶的包含块就是它）')
  })
})
