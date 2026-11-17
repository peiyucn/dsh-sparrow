

import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

import { activePluginNames, repoRoot } from './plugin-set.mjs'

const mode = process.argv[2]

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
