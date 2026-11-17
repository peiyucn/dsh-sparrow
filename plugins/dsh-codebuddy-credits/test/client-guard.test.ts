
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { describe, it } from 'node:test'


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


function fakeDocument() {
  const style = {
    textContent: '',
    removed: false,

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
    if (descriptor === undefined) delete (globalThis as { document?: unknown }).document
    else Object.defineProperty(globalThis, 'document', descriptor)
  }
}

describe('client half：缺服务 → 不注册且不抛', () => {
  it('slots / locale 全缺 应该 直接返回、不抛错、不产生任何副作用', () => {
    const restore = silenceConsoleWarn()
    try {
      const warns: string[] = []
      const effects: unknown[] = []
      const ctx = {
        logger: { warn: ( message) => { warns.push(String(message)) } },
        effect: ( fn) => { effects.push(fn()) },
      }
      assert.doesNotThrow(() => { apply( (ctx)) })
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
      const registrations: Array<{ name: string }> = []
      const effects: Array<{ label: string; dispose: () => unknown }> = []
      const ctx = {
        logger: { warn: () => {} },
        locale: { register: () => () => {}, bind: () => () => '' },
        slots: {

          inject: (_name, callback) => { callback() },

          register: (definition) => { registrations.push(definition); return () => {} },
        },
        root: { get: () => undefined },

        effect: (fn, label) => { effects.push({ label, dispose: fn() }) },
      }
      assert.doesNotThrow(() => { apply( (ctx)) })
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
