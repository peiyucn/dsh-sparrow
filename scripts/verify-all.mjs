#!/usr/bin/env node
/** 逐个插件运行 npm run verify。 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
// 只验证已脚手架化的插件（有 package.json）；纯文档目录（如 spec 阶段的插件）跳过。
const plugins = readdirSync(join(root, 'plugins'), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .filter(name => existsSync(join(root, 'plugins', name, 'package.json')))
  .sort()

let failed = false
for (const name of plugins) {
  console.log(`\n===== verify ${name} =====`)
  const result = spawnSync('npm', ['run', 'verify'], {
    cwd: join(root, 'plugins', name),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) failed = true
}
process.exit(failed ? 1 : 0)
