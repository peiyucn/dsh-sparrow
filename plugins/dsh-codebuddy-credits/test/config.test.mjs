import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { Config, keyRefs } from '../lib/config.js'
import { NS } from '../lib/constants.js'

const DIR = path.dirname(fileURLToPath(import.meta.url))

describe('keyRefs', () => {
  it('默认配置：官方派生名优先，旧引用兜底', () => {
    assert.deepEqual(keyRefs(undefined), ['CODEBUDDY_CREDITS_API_KEY', 'CODEBUDDY_API_KEY'])
  })

  it('自定义 apiKeyEnv 生效，旧引用仍兜底', () => {
    assert.deepEqual(keyRefs('MY_OWN_KEY'), ['MY_OWN_KEY', 'CODEBUDDY_API_KEY'])
  })

  it('apiKeyEnv 配成旧引用时去重（同引用不重复尝试/迁移）', () => {
    assert.deepEqual(keyRefs('CODEBUDDY_API_KEY'), ['CODEBUDDY_API_KEY'])
  })
})

describe('Config schema（0.1.7 的 volatile 配置面）', () => {
  const parsed = Config({})

  it('maxMode 缺省默认 false（旧设置节无该字段时安全）', () => {
    assert.equal(parsed.maxMode.get(), false)
  })

  it('显式 true 保留', () => {
    assert.equal(Config({ maxMode: true }).maxMode.get(), true)
  })

  it('apiKeyEnv 默认官方派生名', () => {
    assert.equal(parsed.apiKeyEnv.get(), 'CODEBUDDY_CREDITS_API_KEY')
  })

  it('两个字段都是 volatile（设置写入只认 volatile 路径，缺了就完全改不动设置）', () => {
    // volatile 标记在官方 schemastery 的 schema meta 上，设置面据此挑选可编辑字段；
    // toJSON() 是保留共享/递归引用的文档：uid 指根，dict 成员是 refs 下标。
    const json = Config.toJSON()
    const root = json.refs[json.uid]
    const field = (key) => json.refs[root.dict[key]]
    assert.equal(field('maxMode').meta.volatile, true)
    assert.equal(field('apiKeyEnv').meta.volatile, true)
    assert.equal(typeof parsed.maxMode.get, 'function')
    assert.equal(typeof parsed.apiKeyEnv.get, 'function')
  })
})

describe('设置命名空间 = profile 条目 id', () => {
  it('NS 必须等于自带 cordis.patch.yml 的 insert id（否则设置读写找不到条目）', () => {
    // 设置命名空间即 profile 条目 id（SettingsForms 按它查条目），条目 id 由本包
    // dsh.bundle.patch 的 insert 决定；漏改即运行期「No configurable plugin entry」。
    const text = fs.readFileSync(path.join(DIR, '..', 'cordis.patch.yml'), 'utf8')
    const id = /^\s*-\s*id:\s*(\S+)\s*$/m.exec(text)?.[1]
    assert.equal(id, NS)
  })
})
