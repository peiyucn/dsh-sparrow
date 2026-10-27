// @ts-check
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { describe, it } from 'node:test'

/**
 * client half 的惰性停用：缺服务时只告警 + `return`，不注册任何槽位 / 样式，**绝不抛错**
 * （DSH Web 的 boot 审计把任一 client entry 非 active 当致命失败，抛错会整页只渲染
 * "Failed to load plugins"）。
 *
 * 真实 `apply` 会 import 官方 ui-primitives，而后者在 Node 下缺 `clsx`（浏览器 bundle 里是
 * external）——故用模块钩子把它换成只提供导出名的空桩，其余模块照常加载，跑真实 apply。
 */
const PRIMITIVES_STUB = 'data:text/javascript,' + encodeURIComponent([
  'export const StateDot = () => null',
  'export const Tag = () => null',
  'export const useAnchoredPosition = () => null',
  'export const useDismissOnOutsidePointer = () => {}',
].join(';'))

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') {
      return { url: PRIMITIVES_STUB, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})

const { apply } = await import('../lib/client/index.js')

function silenceConsoleWarn() {
  const original = console.warn
  console.warn = () => {}
  return () => { console.warn = original }
}

/** 仅供样式注入用的最小 document 桩。 */
function fakeDocument() {
  const style = {
    textContent: '',
    removed: false,
    /** @param {string} name @param {string} value */
    setAttribute(name, value) { this[name] = value },
    remove() { this.removed = true },
  }
  const doc = {
    querySelector: () => null,
    createElement: () => style,
    head: { appendChild: () => {} },
  }
  return { style, doc }
}

/** 在 document 桩存在期间执行 fn（client half 只在浏览器里跑）。 */
async function withDocument(fn) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const originalWarn = console.warn
  const { style, doc } = fakeDocument()
  Object.defineProperty(globalThis, 'document', { value: doc, configurable: true, writable: true })
  console.warn = () => {}
  try {
    return await fn(style)
  } finally {
    console.warn = originalWarn
    if (descriptor === undefined) delete (/** @type {any} */ (globalThis)).document
    else Object.defineProperty(globalThis, 'document', descriptor)
  }
}

describe('client half：缺服务 → 不注册且不抛', () => {
  it('slots / locale 全缺 应该 直接返回、不抛错、不产生任何副作用', () => {
    const restore = silenceConsoleWarn()
    try {
      const warns = []
      const effects = []
      const ctx = {
        logger: { warn: (/** @type {unknown} */ message) => { warns.push(String(message)) } },
        effect: (/** @type {() => unknown} */ fn) => { effects.push(fn()) },
      }
      assert.doesNotThrow(() => { apply(/** @type {any} */ (ctx)) })
      assert.equal(effects.length, 0, '能力门不通过时不得登记任何 effect（样式 / 词典 / 槽位）')
      assert.equal(warns.length, 1)
      assert.match(warns[0], /ctx\.slots\.inject/u)
      assert.match(warns[0], /已停用插件以免影响 dsh/u)
    } finally {
      restore()
    }
  })

  it('服务齐备 应该 注入一次样式、注册 6 个槽位，并在卸载时移除样式', async () => {
    await withDocument((style) => {
      const registrations = []
      const effects = []
      const ctx = {
        logger: { warn: () => {} },
        locale: { register: () => () => {}, bind: () => () => '' },
        slots: {
          /** @param {string} _name @param {() => void} callback */
          inject: (_name, callback) => { callback() },
          /** @param {object} definition */
          register: (definition) => { registrations.push(definition); return () => {} },
        },
        root: { get: () => undefined },
        /** @param {() => unknown} fn @param {string} label */
        effect: (fn, label) => { effects.push({ label, dispose: fn() }) },
      }
      assert.doesNotThrow(() => { apply(/** @type {any} */ (ctx)) })
      assert.equal(registrations.length, 6, '六个槽位都应注册：卡片 / 模型标签 / 头部入口 / hero / 每轮 / 会话')
      const names = registrations.map((entry) => entry.name)
      assert.deepEqual(names.sort(), [
        'conversation.chat.assistant-actions',
        'conversation.composer.dock',
        'conversation.input.dock',
        'conversation.input.model.label',
        'conversation.session.header.utilities',
        'settings.models.provider-card',
      ])
      const styleEffect = effects.find((entry) => entry.label.includes('styles'))
      assert.ok(styleEffect !== undefined, '样式表必须登记卸载清理 effect')
      assert.equal(style.removed, false)
      styleEffect.dispose()
      assert.equal(style.removed, true, '卸载时必须移除注入的 <style>')
    })
  })
})
