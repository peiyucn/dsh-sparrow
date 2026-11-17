

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const mode = process.argv[2]
const all = mode === undefined
const runTypecheck = all || mode === '--typecheck'
const runBuild = all || mode === '--build'
const runTest = all || mode === '--test'
const runPackage = all || mode === '--package'

const cwd = process.cwd()
const workspaceRoot = resolve(cwd, '..', '..')




const checkoutSource = process.env.DSH_SOURCE ?? join(homedir(), '.dsh-launcher-panel', 'source')
const checkoutTsc = join(checkoutSource, 'node_modules', 'typescript', 'bin', 'tsc')
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





  const libDir = join(cwd, 'lib')
  if (existsSync(libDir)) rmSync(libDir, { recursive: true, force: true })

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



  const testTsconfig = join(cwd, 'tsconfig.test.json')
  if (existsSync(testTsconfig)) {
    console.log(`verify: typecheck test ${cwd}`)
    const testTypecheck = spawnSync(process.execPath, [tsc, '-p', testTsconfig], {
      cwd,
      stdio: 'inherit',
      shell: false,
    })
    if (testTypecheck.status !== 0) process.exit(testTypecheck.status ?? 1)
  }

  console.log('verify: node:test')


  const testArgs = process.env.CI
    ? ['--test', '--test-reporter=junit', '--test-reporter-destination=junit.xml', 'test/**/*.test.ts']
    : ['--test', 'test/**/*.test.ts']
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
