// @ts-check
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { KNOWN_SETTINGS_STORAGE_KEY, parseKnownSettings, readKnownSettings, rememberKnownSettings } from '../lib/client/known-settings.js'

/** 内存版存储面（可注入抛错）。 */
function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, value) },
    dump: () => Object.fromEntries(map),
  }
}

/** 读写都抛错的存储面（隐私模式 / 配额满的近似）。 */
const throwingStorage = {
  getItem: () => { throw new Error('blocked') },
  setItem: () => { throw new Error('blocked') },
}

describe('known-settings：客户端设置副本（冷加载兜底）', () => {
  it('合法存档应原样解析（两轴都必须是该轴可用的色调 id）', () => {
    assert.deepEqual(parseKnownSettings(JSON.stringify({ lightTone: 'sakura', darkTone: 'violet' })), { lightTone: 'sakura', darkTone: 'violet' })
    assert.deepEqual(parseKnownSettings(JSON.stringify({ lightTone: 'official', darkTone: 'official' })), { lightTone: 'official', darkTone: 'official' })
  })

  it('脏数据一律返回 null（宁可不画，也不画一个不存在的色调）', () => {
    for (const raw of [
      null,
      '',
      'not-json',
      'null',
      '[]',
      '"violet"',
      '{}',
      '{"lightTone":"sakura"}',
      '{"lightTone":"violet","darkTone":"violet"}',
      '{"lightTone":"sakura","darkTone":"sakura"}',
      '{"lightTone":1,"darkTone":"violet"}',
    ]) {
      assert.equal(parseKnownSettings(raw), null, `应拒绝：${String(raw)}`)
    }
  })

  it('readKnownSettings 在存储不可用时应返回 null（不抛）', () => {
    assert.equal(readKnownSettings(throwingStorage), null)
    assert.equal(readKnownSettings(memoryStorage()), null)
  })

  it('rememberKnownSettings ↔ readKnownSettings 应往返一致；存储不可用时静默失败', () => {
    const storage = memoryStorage()
    rememberKnownSettings(storage, { lightTone: 'sakura', darkTone: 'violet' })
    assert.deepEqual(readKnownSettings(storage), { lightTone: 'sakura', darkTone: 'violet' })
    assert.ok(Object.hasOwn(storage.dump(), KNOWN_SETTINGS_STORAGE_KEY), '应写在插件自己的键下')
    assert.doesNotThrow(() => { rememberKnownSettings(throwingStorage, { lightTone: 'official', darkTone: 'official' }) })
  })

  it('接线：readSettings 走 lastReady ?? known ?? local；loading 且有副本时仍要画', async () => {
    const src = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    assert.match(src, /lastReadySettings \?\? knownSettings \?\? localSettings/u, '读设置的兜底链必须带上 knownSettings')
    assert.match(src, /if \(status === 'loading'\) return knownSettings !== null/u, 'loading 且有副本时必须上色（否则样式退回官方）')
    assert.match(src, /rememberSettings\(snapshot\.value\)/u, '权威值到达时必须写入副本')
    // 用户点选（setTone）时也要立刻落副本：否则「镜像未就绪期间改色」会在结算后跳回旧副本色。
    assert.match(src, /knownSettings = chosen/u, 'setTone 必须同步更新客户端副本')
    assert.match(src, /rememberKnownSettings\(window\.localStorage, chosen\)/u, 'setTone 必须把选择写进 localStorage')
  })
})
