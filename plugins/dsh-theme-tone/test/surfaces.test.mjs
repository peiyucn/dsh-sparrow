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

  it('这是修官方写死的牌面，不带「官方默认」门（官方默认档同样生效）', () => {
    assert.ok(!css.includes('data-dsh-theme-tone-plain'))
  })
})
