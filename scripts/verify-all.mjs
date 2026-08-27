#!/usr/bin/env node
/** 逐个插件运行 npm run verify。 */
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const plugins = readdirSync(join(root, 'plugins'), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
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
