


import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(DIR, '..', 'src')
const HOST = path.join(SRC, 'host')


function hostSources() {
  const files = [path.join(SRC, 'index.ts')]
  for (const name of fs.readdirSync(HOST)) {
    if (name.endsWith('.ts')) files.push(path.join(HOST, name))
  }
  return files.map((file) => fs.readFileSync(file, 'utf8')).join('\n')
}
const HOST_TEXT = hostSources()


const BUILTINS = new Set([
  'get', 
  'inject', 
  'effect', 
  'logger', 
  'root', 
  'on', 'emit', 'parallel', 'series', 'waterfall', 'bail', 
  'scope', 'isolate', 'extend', 'set', 'provide', 'accessor', 
  'fiber', 'reflect', 'registry', 'events', 
])

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}


function optionalInjectServices(text) {
  const names = new Set<string>()
  for (const m of stripComments(text).matchAll(/ctx\.inject\(\s*\[([^\]]*)\]/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().replace(/^['"]|['"]$/g, '')
      if (name) names.add(name)
    }
  }
  return names
}

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


function usedServices(text) {
  const used = new Set<string>()
  const clean = stripComments(text)
  for (const m of clean.matchAll(/\bctx\.([A-Za-z_$][\w$]*)/g)) used.add(m[1])
  for (const m of clean.matchAll(/\b[A-Za-z_$][\w$]*Ctx\.([A-Za-z_$][\w$]*)/g)) used.add(m[1])
  return used
}

test('宿主侧访问的每个 ctx 服务都在 inject 里声明（或为内建 / 可选依赖 fork）', () => {
  const indexText = fs.readFileSync(path.join(SRC, 'index.ts'), 'utf8')
  const declared = declaredInject(indexText)
  const optional = optionalInjectServices(HOST_TEXT)
  const missing = [...usedServices(HOST_TEXT)]
    .filter((s) => !BUILTINS.has(s) && !declared.has(s) && !optional.has(s))

  assert.deepEqual(
    missing,
    [],
    `host half 访问了未在 inject 声明的服务：${missing.join(', ')}。`
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
  const indexText = fs.readFileSync(path.join(SRC, 'index.ts'), 'utf8')
  const declared = declaredInject(indexText)
  assert.equal(
    declared.has('sessionProjections'),
    false,
    '积分是展示面：投影服务缺席时不该把用户的推理 provider 一起停掉，'
      + '故它必须是 ctx.inject([...], cb) 起的可选 fork，而不是硬依赖。',
  )
  assert.ok(
    optionalInjectServices(HOST_TEXT).has('sessionProjections'),
    '可选 fork 必须真的声明 sessionProjections（否则注册表永远拿不到，积分静默只剩冷路径）。',
  )
  assert.ok(
    /sessionProjections\.register\(/.test(stripComments(HOST_TEXT)),
    'fork 里必须注册投影单元。',
  )
})

test('⛔ 不得再调用被官方废弃的同步会话读（2026-09-26 迁移的回归守卫）', () => {

  const offenders: string[] = []
  for (const entry of fs.readdirSync(SRC, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue
    const file = path.join(entry.parentPath, entry.name)
    const text = stripComments(fs.readFileSync(file, 'utf8'))
    for (const method of ['snapshotEvents', 'eventAt', 'ownEvents']) {
      if (new RegExp(`\\.${method}\\s*\\(`).test(text)) {
        offenders.push(`${path.relative(SRC, file)} → .${method}()`)
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `宿主侧不得调用被废弃的同步会话读：${offenders.join(', ')}。`
      + 'live 路径请读 ctx.sessionProjections 的投影状态（dsh 0.2.2 起用 ProjectionHandle.stateOf），'
      + '冷路径走官方 ctx.sessionPersistence.open(id, \'read\')。',
  )
})

test('inject 只列真实存在的服务名（无笔误）', () => {
  const text = fs.readFileSync(path.join(SRC, 'index.ts'), 'utf8')
  const declared = declaredInject(text)

  const KNOWN = new Set(['llm', 'attachments', 'sessions'])
  const unknown = [...declared].filter((s) => !KNOWN.has(s))
  assert.deepEqual(unknown, [], `inject 里出现未登记的服务名：${unknown.join(', ')}`)
})

test('可选 fork 只列真实存在的服务名（无笔误）', () => {
  const optional = optionalInjectServices(HOST_TEXT)
  const KNOWN = new Set(['sessionProjections', 'settings'])
  const unknown = [...optional].filter((s) => !KNOWN.has(s))
  assert.deepEqual(unknown, [], `可选 fork 里出现未登记的服务名：${unknown.join(', ')}`)
})
