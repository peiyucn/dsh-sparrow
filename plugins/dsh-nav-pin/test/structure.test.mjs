import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('dsh-nav-pin 结构', () => {
  it('package.json 应该 声明 dsh.bundle 与 dsh.client（纯客户端无依赖注入）', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
    assert.equal(pkg.dsh.client.platform, 'web')
    assert.deepEqual(pkg.dsh.client.inject, [])
    assert.equal(pkg.exports['./client'].default, './lib/client.js')
  })

  it('package.json files 应该 覆盖 lib/index.js 的运行时依赖（防发布包缺文件回归）', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    const index = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')
    const deps = [...index.matchAll(/from '\.\/([^']+)\.js'/gu)].map(match => match[1])
    for (const dep of deps) {
      assert.ok(
        pkg.files.includes('lib/**/*.js') || pkg.files.includes(`lib/${dep}.js`),
        `files 缺少 lib/${dep}.js（lib/index.ts 静态 re-export 了它）`,
      )
    }
  })

  it('cordis.patch.yml 应该 按 bundle patch 结构插入 host 行', async () => {
    const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    assert.match(patch, /- insert:/u)
    assert.match(patch, /id: dsh-nav-pin/u)
    assert.match(patch, /name: '@dsh-sparrow\/dsh-nav-pin'/u)
  })

  it('⛔ client half 的能力门不得抛错（抛错 = 宿主整页起不来）', async () => {
    // 客户端侧没有「逐插件捕获 apply 异常」的隔离：任何非 active 的 entry 都是致命失败
    // （dsh 0.1.7-alpha.1 packages/client/web/src/boot-client.ts:63-82）。故 client half
    // 走惰性停用（告警 + return），不使用抛错版能力门。
    const src = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    assert.match(src, /warnMissingCapabilities\(/u, 'client half 要走不抛错的能力门')
    assert.ok(!/assertCapabilities/u.test(src), 'client half 不得用抛错版能力门')
    const iGate = src.indexOf('warnMissingCapabilities(')
    const iReturn = src.indexOf('return', iGate)
    const iStyles = src.indexOf('const style = ensureNavPinStyles()')
    assert.ok(iGate > 0 && iReturn > 0 && iStyles > 0, '锚点缺失（实现改过？）')
    assert.ok(iGate < iReturn && iReturn < iStyles, '惰性停用必须在注入样式表之前返回')
  })
})
