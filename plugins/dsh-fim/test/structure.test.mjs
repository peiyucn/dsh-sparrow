import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('dsh-fim 结构', () => {
  it('package.json 应该 声明 dsh.bundle 与 dsh.client', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
    assert.equal(pkg.dsh.client.platform, 'web')
    assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-conversation'))
    assert.equal(pkg.exports['./client'].default, './lib/client.js')
  })

  it('cordis.patch.yml 应该 按 bundle patch 结构插入 host 行', async () => {
    const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    assert.match(patch, /- insert:/u)
    assert.match(patch, /id: dsh-fim/u)
    assert.match(patch, /name: dsh-fim/u)
    assert.match(patch, /apiKeyEnv: DEEPSEEK_API_KEY/u)
  })
})
