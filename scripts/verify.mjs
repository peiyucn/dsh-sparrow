#!/usr/bin/env node
/**
 * 单插件本地验证：typecheck（使用本机 dsh checkout 的 tsc）+ node:test。
 * 在各插件目录通过 `npm run verify` 调用，工作目录必须是插件根目录。
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const cwd = process.cwd()
const dshSource = resolve(process.env.DSH_SOURCE ?? 'C:/Users/DJ028191/.dsh-launcher-panel/source')
const tsc = join(dshSource, 'node_modules', 'typescript', 'bin', 'tsc')

if (!existsSync(join(cwd, 'tsconfig.json'))) {
  console.error(`verify: ${cwd} 缺少 tsconfig.json`)
  process.exit(1)
}

console.log(`verify: typecheck ${cwd}`)
const typecheck = spawnSync(process.execPath, [tsc, '-p', join(cwd, 'tsconfig.json')], {
  cwd,
  stdio: 'inherit',
  shell: false,
})
if (typecheck.status !== 0) {
  process.exit(typecheck.status ?? 1)
}

const bundleScript = join(cwd, 'scripts', 'bundle-client.mjs')
if (existsSync(bundleScript)) {
  console.log('verify: bundle client')
  const bundle = spawnSync(process.execPath, [bundleScript], { cwd, stdio: 'inherit', shell: false })
  if (bundle.status !== 0) process.exit(bundle.status ?? 1)
}

console.log('verify: node:test')
const test = spawnSync(process.execPath, ['--test', 'test/*.test.mjs'], {
  cwd,
  stdio: 'inherit',
  shell: false,
})
process.exit(test.status ?? 1)
