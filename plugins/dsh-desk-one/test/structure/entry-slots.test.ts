

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LOCALE_NAMESPACE, PACKAGE_NAME, PANEL_ID } from '../../lib/constants.js'
import { installDeskClient, passesClientGate } from '../../lib/client/install.js'
import { createReviewBridge, REVIEW_TAB_ID, REVIEW_TAB_KIND } from '../../lib/client/notebook/review-bridge.js'
import { read, readJson } from './helpers.ts'

type SlotEntry = { key?: unknown, id?: unknown }

interface SlotRegistration {
  name: unknown
  entry: SlotEntry
  component: unknown
}

interface LocaleRegistration {
  namespace: string
  dictionaries: unknown
}

type EffectFn = () => (() => void) | void

function fakeClientContext() {
  const registrations: SlotRegistration[] = []
  const effects: EffectFn[] = []
  const locales: LocaleRegistration[] = []
  const slots = {
    inject: (name, callback) => {
      callback()
      return () => {}
    },
    register: (entry, component) => {
      registrations.push({ name: entry.name, entry, component })
      return () => {}
    },
  }
  const layout = { selectPanel: () => {}, panelInfo: { getSnapshot: () => ({ activePanelId: null }) } }
  const layoutCtx = {
    slots,
    get: (service) => (service === 'layout' ? layout : undefined),
    effect: (callback) => { effects.push(callback) },
  }
  const ctx = {
    slots,
    locale: {
      register: (namespace, dictionaries) => {
        locales.push({ namespace, dictionaries })
        return () => {}
      },
      bind: () => (key) => key,
    },
    inject: (services, callback) => {
      if (services.includes('layout')) callback(layoutCtx)
    },
    effect: (callback) => { effects.push(callback) },
    logger: { warn: () => {}, info: () => {} },
  }
  return { ctx, registrations, effects, locales }
}

function stubDocument() {
  const styleElement = { textContent: '', setAttribute: () => {}, remove: () => {} }
  const listeners: { click: unknown[] } = { click: [] }
  const removed: unknown[] = []
  const globals: { document?: unknown } = globalThis
  const previous = globals.document
  globals.document = {
    querySelector: () => null,
    createElement: () => styleElement,
    head: { appendChild: () => {} },
    addEventListener: (type, listener) => {
      if (type === 'click') listeners.click.push(listener)
    },
    removeEventListener: (type, listener) => {
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


const stubComponent = () => null

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
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (...args) => { warnings.push(args.join(' ')) }
    try {

      const slots = {
        inject: () => { throw new Error('能力门失败后不得注册槽位') },
        register: () => { throw new Error('能力门失败后不得注册槽位') },
      }
      const partial = {
        slots,
        effect: () => { throw new Error('能力门失败后不得注册 effect') },
        logger: { warn: (message) => warnings.push(message) },
      }
      assert.equal(passesClientGate(partial), false)
      assert.doesNotThrow(() => installDeskClient(partial, fakeClientDeps()))
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
