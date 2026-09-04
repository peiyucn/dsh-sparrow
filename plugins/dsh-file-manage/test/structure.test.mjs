import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('dsh-file-manage 结构', () => {
  it('package.json 应该 声明 dsh.bundle 与 dsh.client（侧边栏入口依赖）', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
    assert.equal(pkg.dsh.client.platform, 'web')
    assert.deepEqual(pkg.dsh.client.inject, [
      '@deepseek-ai/dsh-client-runtime',
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-sidebar',
    ])
    assert.equal(pkg.exports['./client'].default, './lib/client.js')
  })

  it('package.json peerDependencies 应该 声明官方客户端与凭据/设置 seam', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    assert.ok('@deepseek-ai/dsh-llm-deepseek' in pkg.peerDependencies)
    assert.ok('@deepseek-ai/dsh-credentials' in pkg.peerDependencies)
    assert.ok('@deepseek-ai/dsh-settings' in pkg.peerDependencies)
    assert.ok('@deepseek-ai/dsh-host-webserver' in pkg.peerDependencies)
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
    assert.match(patch, /id: dsh-file-manage/u)
    assert.match(patch, /name: '@dsh-sparrow\/dsh-file-manage'/u)
  })

  it('lib/ 应该 不残留 src 已删除组件的编译产物（防改名后过期产物随包发布）', () => {
    // FileSessionDock 曾随 0.1.0 发布（src 已改名 FileManageDock，tsc 不清 lib/）。
    assert.equal(existsSync(new URL('../lib/client/FileSessionDock.js', import.meta.url)), false)
    assert.equal(existsSync(new URL('../lib/types/client/FileSessionDock.d.ts', import.meta.url)), false)
  })
})
