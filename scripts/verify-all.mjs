#!/usr/bin/env node
/** 逐个插件运行验证：默认 typecheck + build + test；`--typecheck` / `--build` / `--test` 只跑单项。 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
// 活跃 / 已退役插件名单是**单一真值**（与 check-dsh-pin.mjs 共用同一份，防两边漂移）。
import { activePluginNames, repoRoot } from './plugin-set.mjs'

const mode = process.argv[2] // undefined | '--typecheck' | '--build' | '--test'

const root = repoRoot
const plugins = activePluginNames(root)

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
