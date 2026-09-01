#!/usr/bin/env node
/**
 * 单插件本地验证：typecheck（tsc --noEmit）+ build（tsc 产出 lib/ + client bundle）
 * + test（node:test）+ package（npm pack --dry-run 校验 files 清单）。
 * 在各插件目录通过 `npm run verify` 调用，工作目录必须是插件根目录。
 * 参数：`--typecheck` / `--build` / `--test` / `--package` 只跑对应单项，默认全跑。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const mode = process.argv[2] // undefined | '--typecheck' | '--build' | '--test' | '--package'
const all = mode === undefined
const runTypecheck = all || mode === '--typecheck'
const runBuild = all || mode === '--build'
const runTest = all || mode === '--test'
const runPackage = all || mode === '--package'

const cwd = process.cwd()
const workspaceRoot = resolve(cwd, '..', '..')
// 本机优先用 dsh checkout 的 tsc（与运行时源码一致）；CI / 无 checkout 时回退到
// workspace 根安装的 typescript（root devDependencies 固定与本机同版本）。
const checkoutTsc = join(process.env.DSH_SOURCE ?? 'C:/Users/DJ028191/.dsh-launcher-panel/source', 'node_modules', 'typescript', 'bin', 'tsc')
const tsc = existsSync(checkoutTsc) ? checkoutTsc : resolve(workspaceRoot, 'node_modules', 'typescript', 'bin', 'tsc')

if ((runTypecheck || runBuild) && !existsSync(tsc)) {
  console.error(`verify: 找不到 typescript（已尝试 checkout ${checkoutTsc} 与 workspace ${workspaceRoot}）`)
  process.exit(1)
}

if ((runTypecheck || runBuild) && !existsSync(join(cwd, 'tsconfig.json'))) {
  console.error(`verify: ${cwd} 缺少 tsconfig.json`)
  process.exit(1)
}

if (runTypecheck) {
  console.log(`verify: typecheck ${cwd}`)
  const typecheck = spawnSync(process.execPath, [tsc, '-p', join(cwd, 'tsconfig.json'), '--noEmit'], {
    cwd,
    stdio: 'inherit',
    shell: false,
  })
  if (typecheck.status !== 0) process.exit(typecheck.status ?? 1)
}

if (runBuild) {
  console.log(`verify: build ${cwd}`)
  const build = spawnSync(process.execPath, [tsc, '-p', join(cwd, 'tsconfig.json')], {
    cwd,
    stdio: 'inherit',
    shell: false,
  })
  if (build.status !== 0) process.exit(build.status ?? 1)

  const bundleScript = join(cwd, 'scripts', 'bundle-client.mjs')
  if (existsSync(bundleScript)) {
    console.log('verify: bundle client')
    const bundle = spawnSync(process.execPath, [bundleScript], { cwd, stdio: 'inherit', shell: false })
    if (bundle.status !== 0) process.exit(bundle.status ?? 1)

    // 客户端 bundle 的 __ModuleLoader__ 注册 id 必须等于 npm 包名（scoped name）。
    const clientPath = join(cwd, 'lib', 'client.js')
    if (!existsSync(clientPath)) {
      console.error(`verify: 缺少 client bundle 产物 ${clientPath}`)
      process.exit(1)
    }
    const manifest = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'))
    const firstLine = readFileSync(clientPath, 'utf8').split(/\r?\n/, 1)[0] ?? ''
    const registeredId = /window\.__ModuleLoader__\.load\(\{\s*id:\s*["']([^"']+)["']/.exec(firstLine)?.[1]
    if (registeredId !== manifest.name) {
      console.error(`verify: client bundle 注册 id 应为 ${manifest.name}，实际为 ${registeredId ?? '(未找到)'}`)
      process.exit(1)
    }
    console.log(`verify: client bundle id ${registeredId}`)
  }
}

if (runTest) {
  console.log('verify: node:test')
  // 注意：--test 的第一个位置参数起，后续 token 都会被当作测试模式，
  // reporter 参数必须放在 glob 前面（放后面会被静默吞掉，junit.xml 不产出）。
  const testArgs = process.env.CI
    ? ['--test', '--test-reporter=junit', '--test-reporter-destination=junit.xml', 'test/*.test.mjs']
    : ['--test', 'test/*.test.mjs']
  const test = spawnSync(process.execPath, testArgs, {
    cwd,
    stdio: 'inherit',
    shell: false,
  })
  if (test.status !== 0) process.exit(test.status ?? 1)
}

if (runPackage) {
  console.log('verify: npm pack --dry-run')
  const pack = spawnSync('npm', ['pack', '--dry-run'], {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (pack.status !== 0) process.exit(pack.status ?? 1)
}
