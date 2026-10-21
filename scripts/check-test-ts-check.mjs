#!/usr/bin/env node
/**
 * 守卫：`plugins/<插件>/test/**\/*.mjs` 一律以 `// @ts-check` 开头。
 *
 * 为什么要有这条：测试侧类型检查走 `tsconfig.test.json`，那里 `checkJs: false` +
 * 每个文件 `// @ts-check` 逐文件开启（不能开全局 `checkJs`，否则会把测试 import 的
 * `lib/*.js` 构建产物一并当源码检查，噪声 100+ 条）。**代价是新增测试文件默认不被检查**，
 * 语义上 fail-open；本守卫把这条补成 fail-closed。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { activePluginNames, repoRoot } from './plugin-set.mjs'

const root = repoRoot
const failures = []

/** 递归收集某目录下的 .mjs 文件。 */
function collect(dir) {
  const out = []
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return out
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...collect(full))
    else if (name.endsWith('.mjs')) out.push(full)
  }
  return out
}

for (const plugin of activePluginNames(root)) {
  const testDir = join(root, 'plugins', plugin, 'test')
  for (const file of collect(testDir)) {
    const firstLine = readFileSync(file, 'utf8').split(/\r?\n/, 1)[0]?.trim() ?? ''
    if (firstLine !== '// @ts-check') failures.push(relative(root, file))
  }
}

if (failures.length > 0) {
  console.error(`check-test-ts-check: ❌ ${failures.length} 个测试文件缺少首行 \`// @ts-check\`（否则不进类型检查）：`)
  for (const file of failures) console.error(`  - ${file}`)
  process.exit(1)
}

console.log(`check-test-ts-check: ✅ 活跃插件的测试文件均以 \`// @ts-check\` 开头`)
