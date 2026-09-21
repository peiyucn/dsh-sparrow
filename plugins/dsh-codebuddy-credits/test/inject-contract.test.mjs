/**
 * inject 契约守卫。
 *
 * 事故背景（2026-09-18）：宿主侧把记账从「进程内数组」改成「会话事件重放」后
 * 开始访问 `ctx.sessions`，但 `export const inject` 里没声明 `sessions`。cordis
 * 的服务必须经 inject 绑定到本插件 fiber 才能在 `ctx.x` 上取到，否则访问即抛
 * `cannot get property "sessions" without inject`——而这条错误**只在请求进来时**
 * 才暴露：插件照常启动、provider 照常注册，typecheck / build / 单测全绿。
 *
 * 本测试把这条约束前移到「跑测试就能发现」：静态扫描宿主侧源码里对 `ctx.<服务>`
 * 的直接访问，要求它要么在 `inject` 里声明，要么是 cordis 内建（`ctx.get` /
 * `ctx.inject` / `ctx.effect` / `ctx.logger` / `ctx.root` 等），要么是经
 * `ctx.inject([...], cb)` 拿到的作用域上下文（如 `webCtx.webServer`）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(DIR, '..', 'src')

/** cordis 内建 / 不经 inject 的上下文成员。 */
const BUILTINS = new Set([
  'get', // 软获取服务（返回 undefined 而非抛错）
  'inject', // 作用域注入
  'effect', // 副作用登记
  'logger', // 内建日志
  'root', // 根上下文
  'on', 'emit', 'parallel', 'series', 'waterfall', 'bail', // 事件
  'scope', 'isolate', 'extend', 'set', 'provide', 'accessor', // 上下文操作
  'fiber', 'reflect', 'registry', 'events', // 核心服务
])

/** 去掉块注释与行注释，避免注释里的 `ctx.x` 造成误报。 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/** 取 `export const inject = [...]` 里声明的服务名。 */
function declaredInject(text) {
  const m = /export\s+const\s+inject\s*=\s*\[([^\]]*)\]/.exec(text)
  assert.ok(m, 'src/index.ts 必须导出 export const inject = [...]')
  return new Set(
    m[1]
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean),
  )
}

/** 扫描源码里直接出现在 `ctx.` 之后的服务名。 */
function usedServices(text) {
  const used = new Set()
  for (const m of stripComments(text).matchAll(/\bctx\.([A-Za-z_$][\w$]*)/g)) used.add(m[1])
  return used
}

test('宿主侧访问的每个 ctx 服务都在 inject 里声明（或为内建）', () => {
  const file = path.join(SRC, 'index.ts')
  const text = fs.readFileSync(file, 'utf8')
  const declared = declaredInject(text)
  const missing = [...usedServices(text)].filter((s) => !BUILTINS.has(s) && !declared.has(s))

  assert.deepEqual(
    missing,
    [],
    `src/index.ts 访问了未在 inject 声明的服务：${missing.join(', ')}。`
      + 'cordis 要求服务经 inject 绑定，否则运行期抛 "cannot get property ... without inject"；'
      + `请在 export const inject 中补上（当前：${[...declared].join(', ')}）。`,
  )
})

test('sessions 已声明为硬依赖（2026-09-18 事故的回归守卫）', () => {
  const text = fs.readFileSync(path.join(SRC, 'index.ts'), 'utf8')
  const declared = declaredInject(text)
  assert.ok(
    declared.has('sessions'),
    '积分账本从会话事件重放取数，必须声明 sessions 硬依赖；'
      + '漏声明会让 /session-usage 与 /turn-usage 在运行期抛 inject 错误。',
  )
})

test('inject 只列真实存在的服务名（无笔误）', () => {
  const text = fs.readFileSync(path.join(SRC, 'index.ts'), 'utf8')
  const declared = declaredInject(text)
  // 本插件已知的宿主服务；新增依赖时同步更新此集合，逼迫作者确认服务名拼写正确。
  const KNOWN = new Set(['llm', 'attachments', 'sessions'])
  const unknown = [...declared].filter((s) => !KNOWN.has(s))
  assert.deepEqual(unknown, [], `inject 里出现未登记的服务名：${unknown.join(', ')}`)
})
