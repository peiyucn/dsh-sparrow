// @ts-check
/**
 * client half 安装守卫：能力门（缺任一硬依赖 → 不注册、不抛错、告警一条）与样式生命周期
 * （注入一次、HMR 命中旧标签只刷新内容、卸载时移除）。
 *
 * 被测模块 `lib/client/install.js` 不 import React 组件（页面 / 图标由入口注入），故可在
 * node:test 里用假 DOM + 假 ctx 跑真实安装流程。
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { installArchiveClient } from '../lib/client/install.js'
import { ensureArchiveStyles } from '../lib/client/styles.js'
import { STYLE_SELECTOR } from '../lib/constants.js'

/** 假 style 元素：record 到 head，remove() 标记并从表里摘掉。 */
function fakeStyle() {
  return {
    textContent: '',
    dataset: {},
    removed: false,
    remove() {
      this.removed = true
      const index = fakeDocument.head.children.indexOf(this)
      if (index >= 0) fakeDocument.head.children.splice(index, 1)
    },
  }
}

/**
 * @type {{
 *   head: { children: any[], appendChild(element: any): void },
 *   querySelector(selector: string): any,
 *   createElement(tag: string): any,
 * }}
 */
const fakeDocument = {
  head: {
    children: [],
    appendChild(element) { fakeDocument.head.children.push(element) },
  },
  querySelector(selector) {
    if (selector !== STYLE_SELECTOR) return null
    return fakeDocument.head.children[0] ?? null
  },
  createElement(tag) {
    assert.equal(tag, 'style')
    return fakeStyle()
  },
}

/** 最小 `window`：remote 桥只用到 dispatchEvent。 */
/** @type {{ events: any[], dispatchEvent(event: any): void }} */
const fakeWindow = {
  events: [],
  dispatchEvent(event) { fakeWindow.events.push(event) },
}

/** 假 client ctx：记录槽位注册 / locale / remote / effect 清理。 */
/** @param {{ missing?: string | null }} [options] */
function fakeCtx({ missing = null } = {}) {
  const registrations = []
  const warnings = []
  const effects = []
  const locales = []
  const remoteHandlers = []
  /** @type {any} */
  const ctx = {
    logger: { warn: (message) => { warnings.push(message) } },
    effect(fn) {
      const dispose = fn()
      if (typeof dispose === 'function') effects.push(dispose)
      return dispose
    },
    inject(names, callback) {
      assert.deepEqual(names, ['layout'])
      return callback(ctx)
    },
    slots: {
      inject(key, callback) {
        registrations.push({ kind: 'inject', key })
        return callback()
      },
      register(options, component) {
        registrations.push({ kind: 'register', options, component })
        return () => {}
      },
    },
    locale: {
      register(namespace, dictionaries) {
        locales.push({ namespace, dictionaries })
        return () => {}
      },
      bind: () => (key) => key,
    },
    remote: {
      $on(event, handler) {
        remoteHandlers.push({ event, handler })
        return () => {}
      },
    },
  }
  if (missing !== null) delete ctx[missing]
  return { ctx, registrations, warnings, effects, locales, remoteHandlers }
}

/** 页面 / 图标桩：安装只透传，不渲染。 */
const deps = {
  page: () => null,
  icon: () => null,
  locales: {
    zh: { 'button.label': '归档管理' },
    en: { 'button.label': 'Archive' },
  },
}

beforeEach(() => {
  fakeDocument.head.children.length = 0
  fakeWindow.events.length = 0
  Object.defineProperty(globalThis, 'document', { value: fakeDocument, configurable: true, writable: true })
  Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true, writable: true })
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'document')
  Reflect.deleteProperty(globalThis, 'window')
})

describe('installArchiveClient 能力门（client half 不抛错）', () => {
  it('能力齐备 应该 注入样式、注册 locale / remote / 两处槽位', () => {
    const { ctx, registrations, warnings, locales, remoteHandlers } = fakeCtx()
    assert.doesNotThrow(() => { installArchiveClient(ctx, deps) })
    assert.equal(warnings.length, 0)
    assert.equal(fakeDocument.head.children.length, 1, '样式表应注入一次')
    assert.equal(locales.length, 1)
    assert.equal(locales[0].namespace, 'archive-manage')
    assert.equal(remoteHandlers.length, 1)
    assert.equal(remoteHandlers[0].event, 'api-session/removed')
    const registered = registrations.filter(row => row.kind === 'register').map(row => row.options)
    assert.deepEqual(registered.map(options => options.name).sort(), ['main', 'sidebar.panellist'])
  })

  // 每一个硬依赖都单独缺一次：缺任一都必须「告警 + 不注册 + 不抛」，否则客户端 boot 审计
  // 会因 entry 非 active 把整页打成 "Failed to load plugins"。
  for (const capability of ['slots', 'locale', 'remote']) {
    it(`缺 ctx.${capability} 应该 不注册、不抛错、告警一条`, () => {
      const { ctx, registrations, warnings, locales, remoteHandlers, effects } = fakeCtx({ missing: capability })
      assert.doesNotThrow(() => { installArchiveClient(ctx, deps) })
      assert.equal(warnings.length, 1, `应只有一条停用告警，实际：${JSON.stringify(warnings)}`)
      assert.match(warnings[0], /已停用插件以免影响 dsh/u)
      assert.deepEqual(registrations, [], '缺能力时不得注册任何槽位')
      assert.equal(locales.length, 0)
      assert.equal(remoteHandlers.length, 0)
      assert.equal(effects.length, 0, '缺能力时不得登记任何 effect')
      assert.equal(fakeDocument.head.children.length, 0, '缺能力时不得注入样式')
    })
  }

  it('缺 ctx.remote.$on（空 remote 服务）应该 同样惰性停用', () => {
    const { ctx, registrations, warnings } = fakeCtx()
    ctx.remote = {}
    assert.doesNotThrow(() => { installArchiveClient(ctx, deps) })
    assert.equal(warnings.length, 1)
    assert.deepEqual(registrations, [])
  })

  // 逐条覆盖能力表里的每一项（两条 slots / 两条 locale / remote.$on）：缺任一都不得继续安装。
  for (const [service, method] of [
    ['slots', 'inject'], ['slots', 'register'], ['locale', 'register'], ['locale', 'bind'], ['remote', '$on'],
  ]) {
    it(`缺 ctx.${service}.${method} 应该 不注册、不抛错、告警一条`, () => {
      const { ctx, registrations, warnings, locales, remoteHandlers, effects } = fakeCtx()
      delete ctx[service][method]
      assert.doesNotThrow(() => { installArchiveClient(ctx, deps) })
      assert.equal(warnings.length, 1, `应只有一条停用告警，实际：${JSON.stringify(warnings)}`)
      // 用 includes 做子串断言：动态 RegExp 要手工转义（`$` 还会被 replace 只替首个，
      // CodeQL js/incomplete-sanitization 因此报警）；能力名是固定字面量，不需要正则。
      assert.ok(
        warnings[0].includes(`ctx.${service}.${method}`),
        `告警应点名 ctx.${service}.${method}，实际：${warnings[0]}`,
      )
      assert.deepEqual(registrations, [], '缺能力时不得注册任何槽位')
      assert.equal(locales.length, 0)
      assert.equal(remoteHandlers.length, 0)
      assert.equal(effects.length, 0, '缺能力时不得登记任何 effect')
      assert.equal(fakeDocument.head.children.length, 0, '缺能力时不得注入样式')
    })
  }
})

describe('归档页样式生命周期', () => {
  it('重复注入 应该 复用同一个 style 元素（不叠加）', () => {
    const first = ensureArchiveStyles()
    const second = ensureArchiveStyles()
    assert.equal(second, first)
    assert.equal(fakeDocument.head.children.length, 1)
  })

  it('HMR 命中旧标签 应该 刷新内容而不是新增标签', () => {
    const style = ensureArchiveStyles()
    style.textContent = '/* stale */'
    const again = ensureArchiveStyles()
    assert.equal(again, style)
    assert.notEqual(again.textContent, '/* stale */')
    assert.match(again.textContent, /\.dsh-archive-page/u)
    assert.equal(fakeDocument.head.children.length, 1)
  })

  it('插件卸载（effect 清理）应该 移除注入的 style 元素', () => {
    const { ctx, effects } = fakeCtx()
    installArchiveClient(ctx, deps)
    assert.equal(fakeDocument.head.children.length, 1)
    // effect 顺序：styles 清理在第一个登记位。
    effects[0]()
    assert.equal(fakeDocument.head.children.length, 0, 'dispose 后页面不得残留样式')
  })
})
