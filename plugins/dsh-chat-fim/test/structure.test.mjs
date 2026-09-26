import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { DEFAULT_MODEL } from '../lib/suggest.js'

describe('dsh-chat-fim 结构', () => {
  it('package.json 应该 声明 dsh.bundle 与 dsh.client', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
    assert.equal(pkg.dsh.client.platform, 'web')
    assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-conversation'))
    assert.equal(pkg.exports['./client'].default, './lib/client.js')
  })

  it('package.json files 应该 覆盖 lib/index.js 的运行时依赖（防发布包缺文件回归）', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    const index = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')
    const deps = [...index.matchAll(/from '\.\/([^']+)\.js'/gu)].map(match => match[1])
    for (const dep of deps) {
      assert.ok(
        pkg.files.includes(`lib/**/*.js`) || pkg.files.includes(`lib/${dep}.js`),
        `files 缺少 lib/${dep}.js（lib/index.ts 静态 re-export 了它）`,
      )
    }
  })

  it('cordis.patch.yml 应该 按 bundle patch 结构插入 host 行', async () => {
    const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    assert.match(patch, /- insert:/u)
    assert.match(patch, /id: dsh-chat-fim/u)
    assert.match(patch, /name: '@dsh-sparrow\/dsh-chat-fim'/u)
    assert.match(patch, /apiKeyEnv: DEEPSEEK_API_KEY/u)
  })

  it('两个 patch 文件的补全模型 应该 都与 DEFAULT_MODEL 一致（防配置漂移）', async () => {
    // `cordis.patch.yml` 是**随包发布**的组合补丁（loader 按包名解析），任何环境都存在；
    // `dev.patch.yml` 是**本机开发用的 overlay**（name 是本机绝对路径、不进仓库，见 .gitignore），
    // 干净检出 / CI 上不存在 —— 故只在它存在时才比对，不因缺文件而红。
    for (const file of ['../cordis.patch.yml', '../dev.patch.yml']) {
      const url = new URL(file, import.meta.url)
      if (!existsSync(url)) {
        assert.equal(file, '../dev.patch.yml', `${file} 应当存在（只有本机开发 overlay 允许缺席）`)
        continue
      }
      const patch = await readFile(url, 'utf8')
      const match = /^\s*model:\s*(\S+)\s*$/mu.exec(patch)
      assert.equal(match?.[1], DEFAULT_MODEL, `${file} 的 model 与 DEFAULT_MODEL 不一致`)
    }
  })
})
