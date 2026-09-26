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

/**
 * 取 `ctx.inject(['a', 'b'], cb)` 里声明的**可选依赖**服务名。
 *
 * 可选依赖 fork（服务出现才装）是根规范《扩展与宿主兼容》要求的写法：
 * 易变面/展示面不放进硬 `inject`，免得服务缺席时把插件主体一起拖停。
 * fork 内部经**作用域上下文**访问服务（如 `projectionCtx.sessionProjections`），
 * 故下面的服务名扫描要把这些名字认下来。
 */
function optionalInjectServices(text) {
  const names = new Set()
  for (const m of stripComments(text).matchAll(/ctx\.inject\(\s*\[([^\]]*)\]/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().replace(/^['"]|['"]$/g, '')
      if (name) names.add(name)
    }
  }
  return names
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

/**
 * 扫描源码里直接出现在 `ctx.` / 作用域上下文（`<x>Ctx.`）之后的成员名。
 * fork 回调参数按惯例以 `Ctx` 结尾（`settingsCtx`、`projectionCtx`、`webCtx` …），
 * 这些上下文上取服务同样要求服务已由该 fork 的 `ctx.inject([...])` 声明，
 * 故一并纳管——否则 fork 里写错服务名不会被发现。
 */
function usedServices(text) {
  const used = new Set()
  const clean = stripComments(text)
  for (const m of clean.matchAll(/\bctx\.([A-Za-z_$][\w$]*)/g)) used.add(m[1])
  for (const m of clean.matchAll(/\b[A-Za-z_$][\w$]*Ctx\.([A-Za-z_$][\w$]*)/g)) used.add(m[1])
  return used
}

test('宿主侧访问的每个 ctx 服务都在 inject 里声明（或为内建 / 可选依赖 fork）', () => {
  const file = path.join(SRC, 'index.ts')
  const text = fs.readFileSync(file, 'utf8')
  const declared = declaredInject(text)
  const optional = optionalInjectServices(text)
  const missing = [...usedServices(text)]
    .filter((s) => !BUILTINS.has(s) && !declared.has(s) && !optional.has(s))

  assert.deepEqual(
    missing,
    [],
    `src/index.ts 访问了未在 inject 声明的服务：${missing.join(', ')}。`
      + 'cordis 要求服务经 inject 绑定，否则运行期抛 "cannot get property ... without inject"；'
      + `请在 export const inject 中补上（硬依赖），或经 ctx.inject([...], cb) 起可选 fork（可选依赖）。`
      + `当前硬依赖：${[...declared].join(', ')}；可选 fork：${[...optional].join(', ')}。`,
  )
})

test('sessions 已声明为硬依赖（2026-09-18 事故的回归守卫）', () => {
  const text = fs.readFileSync(path.join(SRC, 'index.ts'), 'utf8')
  const declared = declaredInject(text)
  assert.ok(
    declared.has('sessions'),
    '积分账本要按会话 id 取 live 会话对象，必须声明 sessions 硬依赖；'
      + '漏声明会让 /session-usage 与 /turn-usage 在运行期抛 inject 错误。',
  )
})

test('sessionProjections 是**可选** fork，不得进硬 inject（2026-09-26 迁移）', () => {
  const text = fs.readFileSync(path.join(SRC, 'index.ts'), 'utf8')
  const declared = declaredInject(text)
  assert.equal(
    declared.has('sessionProjections'),
    false,
    '积分是展示面：投影服务缺席时不该把用户的推理 provider 一起停掉，'
      + '故它必须是 ctx.inject([...], cb) 起的可选 fork，而不是硬依赖。',
  )
  assert.ok(
    optionalInjectServices(text).has('sessionProjections'),
    '可选 fork 必须真的声明 sessionProjections（否则注册表永远拿不到，积分静默只剩冷路径）。',
  )
  assert.ok(
    /sessionProjections\.register\(/.test(stripComments(text)),
    'fork 里必须注册投影单元。',
  )
})

test('⛔ 不得再调用被官方废弃的同步会话读（2026-09-26 迁移的回归守卫）', () => {
  // 官方 0.1.7 起把 `Session.eventAt()` / `snapshotEvents()` / `ownEvents()` 标为
  // `@deprecated … new calls are prohibited`
  //（`.agents/notes/implemented/architecture/2026-09-09-deprecate-synchronous-session-event-reads.md`）。
  // 本插件的 live 账本路径曾用它，现已迁到官方投影注册表。
  // 这条守卫防的是「以后又有人图省事把它加回来」——那是**新增**被禁调用。
  const offenders = []
  for (const entry of fs.readdirSync(SRC, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue
    const file = path.join(entry.parentPath ?? entry.path, entry.name)
    const text = stripComments(fs.readFileSync(file, 'utf8'))
    for (const method of ['snapshotEvents', 'eventAt', 'ownEvents']) {
      // 只看调用形态（成员访问 + 左括号），注释里的说明不算
      if (new RegExp(`\\.${method}\\s*\\(`).test(text)) {
        offenders.push(`${path.relative(SRC, file)} → .${method}()`)
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `宿主侧不得调用被废弃的同步会话读：${offenders.join(', ')}。`
      + 'live 路径请读 ctx.sessionProjections 的投影状态，冷路径走 sessionController.inspect()。',
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

test('可选 fork 只列真实存在的服务名（无笔误）', () => {
  const text = fs.readFileSync(path.join(SRC, 'index.ts'), 'utf8')
  const optional = optionalInjectServices(text)
  const KNOWN = new Set(['sessionProjections', 'settings'])
  const unknown = [...optional].filter((s) => !KNOWN.has(s))
  assert.deepEqual(unknown, [], `可选 fork 里出现未登记的服务名：${unknown.join(', ')}`)
})
