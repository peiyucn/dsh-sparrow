// @ts-check
/**
 * Client entry / slot wiring contract.
 *
 * The client half is boot-audited by DSH: a missing capability may only warn and lazily disable
 * (a throw leaves the whole web host on "Failed to load plugins"), and a left-rail entry is made of
 * exactly the two official main-panel slots sharing one id. These are behaviour contracts, tested by
 * driving the install functions with a fake context instead of reading their source.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LOCALE_NAMESPACE, PACKAGE_NAME, PANEL_ID } from '../../lib/constants.js'
import { installDeskClient, passesClientGate } from '../../lib/client/install.js'
import { createReviewBridge, REVIEW_TAB_ID, REVIEW_TAB_KIND } from '../../lib/client/notebook/review-bridge.js'
import { read, readJson } from './helpers.mjs'

/**
 * Minimal browser-side context: records slot registrations / effects / locale dictionaries and
 * resolves the optional `layout` fork, so `mountMainPanel` registers its two official slots.
 * @returns {{ ctx: any, registrations: any[], effects: any[], locales: any[] }}
 */
function fakeClientContext() {
  /** @type {any[]} */
  const registrations = []
  /** @type {any[]} */
  const effects = []
  /** @type {any[]} */
  const locales = []
  const slots = {
    inject: (/** @type {string} */ name, /** @type {() => any} */ callback) => {
      callback()
      return () => {}
    },
    register: (/** @type {any} */ entry, /** @type {any} */ component) => {
      registrations.push({ name: entry.name, entry, component })
      return () => {}
    },
  }
  const layout = { selectPanel: () => {}, panelInfo: { getSnapshot: () => ({ activePanelId: null }) } }
  const layoutCtx = {
    slots,
    get: (/** @type {string} */ service) => (service === 'layout' ? layout : undefined),
    effect: (/** @type {any} */ callback) => { effects.push(callback) },
  }
  const ctx = {
    slots,
    locale: {
      register: (/** @type {string} */ namespace, /** @type {any} */ dictionaries) => {
        locales.push({ namespace, dictionaries })
        return () => {}
      },
      bind: () => (/** @type {string} */ key) => key,
    },
    inject: (/** @type {string[]} */ services, /** @type {(context: any) => void} */ callback) => {
      if (services.includes('layout')) callback(layoutCtx)
    },
    effect: (/** @type {any} */ callback) => { effects.push(callback) },
    logger: { warn: () => {}, info: () => {} },
  }
  return { ctx, registrations, effects, locales }
}

/** @returns {{ styleElement: any, listeners: { click: Function[] }, removed: Function[], restore: () => void }} */
function stubDocument() {
  const styleElement = { textContent: '', setAttribute: () => {}, remove: () => {} }
  /** @type {{ click: Function[] }} */
  const listeners = { click: [] }
  /** @type {Function[]} */
  const removed = []
  const globals = /** @type {any} */ (globalThis)
  const previous = globals.document
  globals.document = {
    querySelector: () => null,
    createElement: () => styleElement,
    head: { appendChild: () => {} },
    addEventListener: (/** @type {string} */ type, /** @type {Function} */ listener) => {
      if (type === 'click') listeners.click.push(listener)
    },
    removeEventListener: (/** @type {string} */ type, /** @type {Function} */ listener) => {
      if (type === 'click') removed.push(listener)
    },
  }
  return {
    styleElement,
    listeners,
    removed,
    restore: () => {
      if (previous === undefined) delete globals.document
      else globals.document = previous
    },
  }
}

/** Component stand-ins: install only stores them into slot registrations. */
const stubComponent = () => null

/** @returns {any} */
function fakeClientDeps() {
  return {
    page: stubComponent,
    baseIcon: stubComponent,
    icons: { schedule: stubComponent, notebook: stubComponent, notes: stubComponent, tasks: stubComponent, sessions: stubComponent },
    locales: { zh: {}, en: {} },
    api: {},
  }
}

describe('client 入口 / 槽位接线契约', () => {
  it('能力门缺失时应该只告警、不抛错、不注册任何槽位或 effect', async () => {
    const warnings = []
    const originalWarn = console.warn
    console.warn = (...args) => { warnings.push(args.join(' ')) }
    try {
      // 缺 locale 能力，但 slots 表面存在：能力门必须排在一切注册之前。
      const slots = {
        inject: () => { throw new Error('能力门失败后不得注册槽位') },
        register: () => { throw new Error('能力门失败后不得注册槽位') },
      }
      const partial = {
        slots,
        effect: () => { throw new Error('能力门失败后不得注册 effect') },
        logger: { warn: (/** @type {string} */ message) => warnings.push(message) },
      }
      assert.equal(passesClientGate(/** @type {any} */ (partial)), false)
      assert.doesNotThrow(() => installDeskClient(/** @type {any} */ (partial), fakeClientDeps()))
      assert.ok(warnings.some(message => message.includes(PACKAGE_NAME)), '停用告警必须点名插件')
    } finally {
      console.warn = originalWarn
    }
  })

  it('能力齐全时应该只注册官方 main + sidebar.panellist，且两者共享同一 id', async () => {
    const { ctx, registrations, effects, locales } = fakeClientContext()
    const documentStub = stubDocument()
    try {
      assert.equal(passesClientGate(ctx), true)
      installDeskClient(ctx, fakeClientDeps())
    } finally {
      documentStub.restore()
    }

    assert.deepEqual(registrations.map(registration => registration.name), ['main', 'sidebar.panellist'])
    const main = registrations[0]
    const panellist = registrations[1]
    assert.equal(main.entry.key, PANEL_ID, 'main 槽位用面板 id 作为 key')
    assert.equal(panellist.entry.id, PANEL_ID, 'sidebar.panellist 用同一面板 id')
    assert.equal(main.entry.key, panellist.entry.id, '官方主面板契约：main.key 与 sidebar.panellist.id 共享')
    assert.ok(locales.some(registration => registration.namespace === LOCALE_NAMESPACE), 'locale 字典要注册进本插件命名空间')
    assert.ok(effects.length >= 2, '样式与面板注册都要挂 effect 清理（不泄漏监听）')
  })

  it('边栏快捷入口的点击捕获监听必须挂上并在 effect 清理时移除', async () => {
    const { ctx, effects } = fakeClientContext()
    const documentStub = stubDocument()
    try {
      installDeskClient(ctx, fakeClientDeps())
      assert.equal(documentStub.listeners.click.length, 1, 'panel 入口点击捕获只挂一份（capture 阶段）')
      // Every effect callback returns its disposer; running them must remove the capture listener.
      for (const effect of effects) {
        const dispose = effect()
        if (typeof dispose === 'function') dispose()
      }
      assert.equal(documentStub.removed.length, 1, 'effect 清理必须移除点击捕获监听（不泄漏 DOM 监听）')
    } finally {
      documentStub.restore()
    }
  })

  it('审阅 bridge 应该暴露官方服务注入面（复用 / 新建会话的编排契约）', async () => {
    const bridge = createReviewBridge()
    for (const method of [
      'attachSidebar',
      'attachSessions',
      'attachWorkspaces',
      'attachNavigation',
      'open',
      'openFilesBrowser',
      'draftInNewSession',
      'sendQuote',
    ]) {
      assert.equal(typeof bridge[method], 'function', `审阅 bridge 缺注入/编排方法 ${method}`)
    }
    assert.equal(typeof REVIEW_TAB_ID, 'string')
    assert.ok(REVIEW_TAB_ID.length > 0, '审阅 tab 必须有稳定 id')
    assert.equal(typeof REVIEW_TAB_KIND, 'string')
    assert.ok(REVIEW_TAB_KIND.length > 0, '审阅 tab 必须声明 kind')
  })

  it('client bundle 应该保留官方槽位注册与审阅 tab 接线', async () => {
    const pkg = await readJson('package.json')
    const bundle = await read('lib/client.js')
    const firstLine = bundle.split(/\r?\n/u, 1)[0] ?? ''
    const escapedName = String(pkg.name).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
    assert.match(firstLine, new RegExp(`id:\\s*["']${escapedName}["']`, 'u'), 'bundle 的 __ModuleLoader__ 注册 id 必须是包名')

    for (const slot of [
      'main',
      'sidebar.panellist',
      'sidebar.right.pane.tab',
      'sidebar.right.pane.tab.title',
      'sidebar.right.tab.document.actions',
      'conversation.input.overlay',
    ]) {
      assert.ok(bundle.includes(slot), `client bundle 缺官方槽位接线 ${slot}`)
    }
    assert.ok(bundle.includes(REVIEW_TAB_ID), 'client bundle 缺审阅 tab id（右栏审阅 tab 未注册）')
    assert.ok(bundle.includes('dsh-desk-one.pinned-tabs'), 'client bundle 缺左栏固定状态持久化 key')
  })
})
