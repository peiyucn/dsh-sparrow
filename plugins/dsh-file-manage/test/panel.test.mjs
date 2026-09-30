/**
 * 官方「主面板」入口装配守卫（spec 16）。
 *
 * 两层：
 * 1. **惰性停用接线**（本文件的核心）：`layout` 服务缺席时 `attachMainPanel` 必须
 *    **什么都不注册、不抛错** —— client half 的 `inject` 缺服务会让 entry 永远 pending，
 *    而客户端 boot 审计把非 active 的 entry 当**致命**失败（`boot-client.ts:63-82`，
 *    宿主整页只渲染 "Failed to load plugins"）。故 `layout` 走可选依赖 fork。
 * 2. **两处注册共用同一 id 且形状正确**（`main` keyed 槽 + `sidebar.panellist` list 槽）。
 *
 * 纯模块（`lib/client/panel.js` 零运行时依赖），故 node:test 能直接导入。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { attachMainPanel } from '../lib/client/panel.js'

/** 一个可记录注册动作的假 slots 服务。 */
function fakeSlots(registrations) {
  return {
    inject(key, callback) {
      registrations.push({ kind: 'inject', key })
      return callback()
    },
    register(options, component) {
      registrations.push({ kind: 'register', options, component })
      return () => {}
    },
  }
}

/**
 * 假 client 上下文：可切换 `layout` 服务是否在位。
 *
 * `inject(names, cb)` 忠实复刻 cordis 的两种结局（`lib/index.js:1600` → `plugin({inject,...})`）：
 * 服务齐备 ⇒ 回调立即执行；缺服务 ⇒ **永远 pending，回调一次都不跑**（既不报错也不调用）。
 * @param options - `{ hasLayout }`。
 * @returns `{ ctx, registrations, forkRan }`。
 */
function fakeCtx({ hasLayout }) {
  const registrations = []
  const state = { forkRan: false }
  const ctx = {
    inject(names, callback) {
      assert.deepEqual(names, ['layout'], '可选依赖 fork 只该声明 layout')
      if (!hasLayout) return undefined // 服务缺席：fork 挂着，回调不跑（也不抛错）
      state.forkRan = true
      return callback({ slots: fakeSlots(registrations) })
    },
  }
  return { ctx, registrations, state }
}

/** 一份最小的入口件（id / order / locale / label / inject / page / icon）。 */
function entry(overrides = {}) {
  return {
    id: 'file-manage',
    order: 20,
    locale: 'file-manage',
    label: () => '归档',
    inject: () => ({ probe: 'injected' }),
    page: function Page() { return null },
    icon: function Icon() { return null },
    ...overrides,
  }
}

describe('attachMainPanel（spec 16：官方主面板入口装配）', () => {
  it('layout 缺席 应该 什么都不注册且不抛错（惰性停用，宿主照常启动）', () => {
    const { ctx, registrations, state } = fakeCtx({ hasLayout: false })
    assert.doesNotThrow(() => { attachMainPanel(ctx, entry()) })
    assert.deepEqual(registrations, [], 'layout 缺席时不得注册任何槽位')
    assert.equal(state.forkRan, false, 'fork 回调不该被执行')
  })

  it('layout 在位 应该 注册 main + sidebar.panellist 两处（同一 id）', () => {
    const { ctx, registrations, state } = fakeCtx({ hasLayout: true })
    attachMainPanel(ctx, entry())
    assert.equal(state.forkRan, true)

    const registered = registrations.filter(row => row.kind === 'register').map(row => row.options)
    assert.equal(registered.length, 2, '必须恰好两处注册')

    const main = registered.find(options => options.name === 'main')
    const sidebar = registered.find(options => options.name === 'sidebar.panellist')
    assert.ok(main !== undefined, '缺 main 注册（页面没地方渲染）')
    assert.ok(sidebar !== undefined, '缺 sidebar.panellist 注册（左栏没有入口行）')

    // 两处共用同一 id 是关键契约：左栏行按 id 寻址 main 槽（官方 selectPanel 的语义）。
    assert.equal(main.key, 'file-manage')
    assert.equal(sidebar.id, 'file-manage')
    assert.equal(main.key, sidebar.id, 'main.key 与 sidebar.id 必须同值')
  })

  it('两处注册 应该 都经 slots.inject 等槽位声明（不裸注册）', () => {
    const { ctx, registrations } = fakeCtx({ hasLayout: true })
    attachMainPanel(ctx, entry())
    const injected = registrations.filter(row => row.kind === 'inject').map(row => row.key)
    assert.deepEqual(injected, ['main', 'sidebar.panellist'],
      '两处都必须走 slots.inject（等官方槽位声明，注册随声明塌陷而回收）')
  })

  it('order / locale / label / inject 应该 原样落到左栏与页面注册上', () => {
    const { ctx, registrations } = fakeCtx({ hasLayout: true })
    const probe = () => ({ token: 'injected' })
    attachMainPanel(ctx, entry({ order: 21, locale: 'file-manage', label: () => '云端文件', inject: probe }))
    const registered = registrations.filter(row => row.kind === 'register')
    const sidebar = registered.find(row => row.options.name === 'sidebar.panellist')
    const main = registered.find(row => row.options.name === 'main')

    assert.equal(sidebar.options.order, 21)
    assert.equal(sidebar.options.locale, 'file-manage')
    assert.equal(sidebar.options.label(), '云端文件')
    assert.equal(main.options.locale, 'file-manage')
    assert.equal(main.options.inject, probe, '页面的注入面必须原样透传')
  })

  it('label 是 thunk：语言切换后重新取值，不必重注册', () => {
    const { ctx, registrations } = fakeCtx({ hasLayout: true })
    let language = 'zh'
    attachMainPanel(ctx, entry({ label: () => language === 'zh' ? '归档' : 'Archive' }))
    const sidebar = registrations
      .filter(row => row.kind === 'register')
      .find(row => row.options.name === 'sidebar.panellist')
    assert.equal(sidebar.options.label(), '归档')
    language = 'en'
    assert.equal(sidebar.options.label(), 'Archive', 'label 必须是 thunk 而不是定值字符串')
  })

  it('页面与图标组件 应该 交给各自的注册（不串位）', () => {
    const { ctx, registrations } = fakeCtx({ hasLayout: true })
    const Page = function Page() { return null }
    const Icon = function Icon() { return null }
    attachMainPanel(ctx, entry({ page: Page, icon: Icon }))
    const registered = registrations.filter(row => row.kind === 'register')
    const main = registered.find(row => row.options.name === 'main')
    const sidebar = registered.find(row => row.options.name === 'sidebar.panellist')
    assert.equal(main.component, Page)
    assert.equal(sidebar.component, Icon)
  })
})
