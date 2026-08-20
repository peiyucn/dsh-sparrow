import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')

test('package.json 声明了 dsh-sparrow 与 bundle patch', () => {
  assert.equal(pkg.name, 'dsh-sparrow')
  assert.ok(pkg.dsh.bundle.patch)
  assert.ok(pkg.exports['.'])
})

test('cordis.patch.yml 注册 dsh-sparrow 行', () => {
  assert.ok(patch.includes('id: dsh-sparrow'))
})
