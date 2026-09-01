#!/usr/bin/env node
/** 逐个插件运行验证：默认 typecheck + test；`--typecheck` / `--test` 只跑单项。 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const mode = process.argv[2] // undefined | '--typecheck' | '--test'

const root = resolve(import.meta.dirname, '..')
// 只验证已脚手架化的插件（有 package.json）；纯文档目录（如 spec 阶段的插件）跳过。
const plugins = readdirSync(join(root, 'plugins'), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .filter(name => existsSync(join(root, 'plugins', name, 'package.json')))
  .sort()

let failed = false
for (const name of plugins) {
  const label = mode ? `${mode.slice(2)} ${name}` : `verify ${name}`
  console.log(`\n===== ${label} =====`)
  const args = mode ? ['run', 'verify', '--', mode] : ['run', 'verify']
  const result = spawnSync('npm', args, {
    cwd: join(root, 'plugins', name),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) failed = true
}
process.exit(failed ? 1 : 0)
