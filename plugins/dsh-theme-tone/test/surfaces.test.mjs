// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildSurfaceCss } from '../lib/surfaces.js'

const css = buildSurfaceCss()

describe('surfaces: 官方写死牌面的浮层（左边栏 Workspace hover 卡）', () => {
  it('锚点 = body 直接子级、role=button 的 portal 卡片', () => {
    assert.ok(css.includes("body > [role='button'][aria-label]"))
  })

  it('面：官方固定深底换成官方抬升面 token（跟随色调）', () => {
    assert.match(css, /--dsw-hovercard-bg: var\(--dsw-alias-bg-layer-3\)/u)
    assert.ok(!css.includes('#2C2C2E'), '不得再写死官方深底色')
  })

  it('字色：官方写死的白系换成官方 label token，层次保持', () => {
    assert.match(css, /\*='_hoverTitle'[^{]*\{[^}]*--dsw-alias-label-primary/u)
    assert.match(css, /\*='_hoverPath'[^{]*\{[^}]*--dsw-alias-label-secondary/u)
    assert.match(css, /\*='_hoverTime'[^{]*\{[^}]*--dsw-alias-label-secondary/u)
    assert.match(css, /\*='_hoverStatus'[^{]*\{[^}]*--dsw-alias-label-tertiary/u)
    assert.ok(!/#FFFFFF|#CFD3D6|#ADB2B8/u.test(css), '不得残留官方写死的字色')
  })
})

describe('surfaces: 停靠卡材质（todo / goal / queued messages）', () => {
  it('材质从半透明菜单玻璃换成不透明抬升面（多张叠放时每张观感一致）', () => {
    const todo = /\[data-composer-seat\] \[data-testid='todo-panel'\] \{([^}]*)\}/u.exec(css)?.[1] ?? ''
    assert.ok(todo.includes('background: var(--dsw-alias-bg-layer-1) !important'), 'todo 卡根不透明抬升面')
    assert.ok(todo.includes('backdrop-filter: none !important'), '不再做菜单玻璃模糊')
    assert.ok(todo.includes('-webkit-backdrop-filter: none !important'), '同时覆盖 -webkit 前缀')

    const others = /\[data-composer-seat\] :is\(\[data-goal-bar\], \[data-queue-dock\]\) > \*::before \{([^}]*)\}/u
      .exec(css)?.[1] ?? ''
    assert.ok(others.includes('background: var(--dsw-alias-bg-layer-1) !important'), 'goal / queue 材质在卡面子层 ::before')
    assert.ok(others.includes('backdrop-filter: none !important'), '同样不再做菜单玻璃模糊')
  })

  it('官方 elevation 阴影 / 边框 / 圆角不覆盖（只换材质）', () => {
    assert.ok(!css.includes('box-shadow'), '不重写阴影')
    assert.ok(!/border:/u.test(css), '不重写边框')
    assert.ok(!css.includes('border-radius'), '不重写圆角')
  })
})

describe('surfaces: 菜单分组标题', () => {
  it('sticky 标题合成不透明底（主题底色 + 菜单色），滚动时条目不从标题下穿过', () => {
    const heading = /\[data-menu-group-heading\] \{([^}]*)\}/u.exec(css)?.[1] ?? ''
    assert.ok(heading.includes('background-color: var(--dsw-alias-bg-base) !important'), '不透明主题底色')
    assert.ok(heading.includes('background-image: linear-gradient(var(--dsw-specific-menu), var(--dsw-specific-menu)) !important'),
      '再叠一层菜单色 ⇒ 与菜单主体同源、完全不透明')
  })
})

describe('surfaces: 输入框触发菜单（@ / 斜杠 候选列表）', () => {
  it('不再用官方那条会读成「长方形」的色块渐隐条', () => {
    assert.match(css, /\[data-trigger-menu\]::after \{\n  content: none !important;/u,
      '官方 ::after 色块提示条被替换')
  })

  it('改为淡出列表内容本身，且只在还能继续滚时生效（滚到底自动消失）', () => {
    const below = /\[data-trigger-menu\]\[data-overflow-below\] \[role="listbox"\] \{([^}]*)\}/u.exec(css)?.[1] ?? ''
    assert.ok(below.includes('mask-image: linear-gradient(to bottom, black, #000 26px, #000 calc(100% - 26px), transparent)'),
      '底部 26px 渐隐')
    assert.ok(below.includes('-webkit-mask-image'), '覆盖 -webkit 前缀')

    const above = /\[data-trigger-menu\]\[data-overflow-above\] \[role="listbox"\] \{([^}]*)\}/u.exec(css)?.[1] ?? ''
    assert.ok(above.includes('linear-gradient(to bottom, transparent, #000 26px'), '向上滚动后顶部也渐隐')

    const both = /\[data-trigger-menu\]\[data-overflow-below\]\[data-overflow-above\] \[role="listbox"\] \{([^}]*)\}/u
      .exec(css)?.[1] ?? ''
    assert.ok(both.includes('transparent, #000 26px') && both.includes('calc(100% - 26px), transparent'), '两侧都可滚时两头渐隐')
  })
})

describe('surfaces: 修官方牌面不带「官方默认」门', () => {
  it('任何音色（含官方默认档）下都生效', () => {
    assert.ok(!css.includes('data-dsh-theme-tone-plain'))
  })
})
