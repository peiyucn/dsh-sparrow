

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parse as parseYaml } from 'yaml'
import { PACKAGE_NAME } from '../../lib/constants.js'
import { fileExists, read, readJson } from './helpers.ts'

const DSH_PACKAGE_PREFIX = '@deepseek-ai/dsh-'
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/u

function dshPackageVersions(dependencies?: Record<string, string>): string[] {
  const versions = Object.entries(dependencies ?? {})
    .filter(([name]) => name.startsWith(DSH_PACKAGE_PREFIX))
    .map(([, version]) => version)
  return [...new Set(versions)]
}

describe('package 契约', () => {
  it('manifest 应该声明 DSH bundle / client 三件套与发布元数据', async () => {
    const pkg = await readJson('package.json')
    assert.equal(pkg.name, '@dsh-sparrow/dsh-desk-one')
    assert.match(pkg.version, SEMVER)

    assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
    assert.ok(await fileExists('cordis.patch.yml'), 'dsh.bundle.patch 指向的补丁文件必须存在')
    assert.equal(pkg.dsh.client.platform, 'web')
    assert.deepEqual([...pkg.dsh.client.inject].sort(), [
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-sidebar',
    ], 'client entry 只注入跨版本稳定的官方服务（缺失会让 entry 永远 pending）')

    const modulePath = ( value) => String(value).replace(/^[.]\//u, '')
    assert.equal(modulePath(pkg.main), modulePath(pkg.exports['.'].default))
    assert.equal(pkg.exports['.'].default, './lib/index.js')
    assert.equal(pkg.exports['./client'].default, './lib/client.js')
    assert.equal(pkg.publishConfig.access, 'public')
    assert.ok(typeof pkg.repository?.url === 'string', 'npm --provenance 要求声明 repository')
  })

  it('exports / files 应该指向真实构建产物，client 散装模块不进包', async () => {
    const pkg = await readJson('package.json')
    const entryPoints = [pkg.exports['.'].types, pkg.exports['.'].default, pkg.exports['./client'].types, pkg.exports['./client'].default]
    for (const target of entryPoints) {
      assert.equal(typeof target, 'string', `exports 目标必须是字符串：${String(target)}`)
      assert.ok(await fileExists(String(target).replace(/^[.]\//u, '')), `exports 指向的产物不存在：${target}`)
    }

    const files = pkg.files
    assert.ok(Array.isArray(files), 'package.json files 必须是数组')
    for (const required of [
      'lib/index.js',
      'lib/**/*.js',
      '!lib/client/**',
      'cordis.patch.yml',
      'README.md',
      'README.zh-CN.md',
      'CHANGELOG.md',
      'CHANGELOG.zh-CN.md',
    ]) {
      assert.ok(files.includes(required), `files 清单缺 ${required}`)
    }

    for (const entry of files.filter( (item) => String(item).endsWith('.md'))) {
      assert.ok(await fileExists(String(entry)), `files 清单里的 ${entry} 不存在`)
    }

    for (const artifact of ['lib/index.js', 'lib/host.js', 'lib/client.js', 'lib/types/index.d.ts']) {
      assert.ok(await fileExists(artifact), `缺少构建产物 ${artifact}（先跑 build）`)
    }
  })

  it('cordis.patch.yml 应该按 bundle insert 结构注册本插件 host 行', async () => {
    const pkg = await readJson('package.json')
    const patchText = await read('cordis.patch.yml')

    const patch = parseYaml(patchText.replace(/!!js\s+/gu, ''))
    assert.ok(Array.isArray(patch), 'bundle patch 顶层必须是 patch 数组')
    const inserted = patch.flatMap( (block) => (Array.isArray(block?.insert) ? block.insert : []))
    assert.equal(inserted.length, 1, '本插件在 patch 里只插入一行 host entry')
    const entry = inserted[0]
    assert.equal(entry.id, PACKAGE_NAME, 'patch id 用短名，供后续 patch 定位')
    assert.ok(!String(entry.id).startsWith('@'), 'patch id 不得用 scoped 包名')
    assert.equal(entry.name, pkg.name, 'patch name 用 scoped 包名，loader 按包名解析')
    assert.equal(typeof entry.config?.trashRoot, 'string', 'host 行要带 trashRoot 配置（会话回收站目录）')
  })

  it('dsh 版本门应该 peer 范围 / devDeps 精确 / README 一致', async () => {
    const pkg = await readJson('package.json')
    const peerRanges = dshPackageVersions(pkg.peerDependencies)
    assert.equal(peerRanges.length, 1, `peerDependencies 的 dsh 包必须写同一范围，实际：${peerRanges.join(' / ')}`)
    const peerRange = peerRanges[0]
    assert.match(peerRange, /^>=\d+\.\d+\.\d+.*<\d+\.\d+\.\d+$/u, `dsh peer 必须是兼容范围：${peerRange}`)

    const devPins = dshPackageVersions(pkg.devDependencies)
    assert.equal(devPins.length, 1, `devDependencies 的 dsh 包必须写同一精确版本，实际：${devPins.join(' / ')}`)
    const devPin = devPins[0]
    assert.match(devPin, SEMVER, `dsh devDependencies 只能写精确版本：${devPin}`)

    for (const readme of ['README.md', 'README.zh-CN.md']) {
      const text = await read(readme)
      assert.ok(text.includes(pkg.version), `${readme} 缺少当前插件版本 ${pkg.version}`)
      assert.ok(text.includes(peerRange), `${readme} 缺少支持的 DSH 范围 ${peerRange}`)
    }
  })

  it('package 入口应该导出 host half 与可复用纯逻辑', async () => {
    const entry = await import('../../lib/index.js')
    assert.equal(entry.name, PACKAGE_NAME)
    assert.equal(typeof entry.apply, 'function')
    assert.ok(Array.isArray(entry.inject))
    for (const service of ['webServer', 'storageDomain', 'tools']) {
      assert.ok(entry.inject.includes(service), `host inject 缺 ${service}`)
    }

    for (const name of [
      'createNoteRecord',
      'createTaskRecord',
      'patchNoteRecord',
      'patchTaskRecord',
      'normalizeNoteInput',
      'normalizeTaskInput',
      'filterNotes',
      'filterTasks',
      'sortNotes',
      'sortTasks',
      'isTrustedPluginRequest',
      'isTrustedAuthority',
      'parseAuthority',
    ]) {
      assert.equal(typeof entry[name], 'function', `包入口缺导出 ${name}`)
    }
  })
})
