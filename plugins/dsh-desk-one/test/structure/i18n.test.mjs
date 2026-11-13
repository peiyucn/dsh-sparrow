// @ts-check
/**
 * i18n contract: the zh / en dictionaries are two views of the same key set, and the TypeScript
 * locale augmentation must cover every key (otherwise `t('…')` silently stops type-checking).
 * Copy itself is free to change; keys and placeholder slots are the contract.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LOCALE_DICTS } from '../../lib/client/i18n.js'
import { DESK_TABS, OVERFLOW_TABS, VISIBLE_TABS } from '../../lib/client/app/tabs.js'
import { LOCALE_NAMESPACE } from '../../lib/constants.js'
import { read } from './helpers.mjs'

/** @type {Record<string, string>} */
const ZH = LOCALE_DICTS.zh
/** @type {Record<string, string>} */
const EN = LOCALE_DICTS.en
const ZH_KEYS = Object.keys(ZH).sort()
const EN_KEYS = Object.keys(EN).sort()

/**
 * Placeholder slots (`{count}` / `{name}` …) of one message, sorted for order-insensitive compare.
 * @param {string} message
 * @returns {string[]}
 */
function placeholders(message) {
  return [...message.matchAll(/\{[A-Za-z_]+\}/gu)].map(match => match[0]).sort()
}

describe('locale 契约', () => {
  it('zh / en 键集应该一一对应，且同一键的占位符一致', async () => {
    assert.ok(ZH_KEYS.length > 0, 'zh 字典不能为空')
    const missingInEn = ZH_KEYS.filter(key => !(key in EN))
    const missingInZh = EN_KEYS.filter(key => !(key in ZH))
    assert.deepEqual(missingInEn, [], 'zh 有而 en 没有的键')
    assert.deepEqual(missingInZh, [], 'en 有而 zh 没有的键')

    const placeholderMismatch = ZH_KEYS.filter(key => JSON.stringify(placeholders(ZH[key])) !== JSON.stringify(placeholders(EN[key])))
    assert.deepEqual(placeholderMismatch, [], 'zh / en 同一键的占位符必须一致（否则译文会丢参数）')
  })

  it('locale.d.ts 应该覆盖全部字典键', async () => {
    const source = await read('src/client/locale.d.ts')
    assert.ok(source.includes(`'${LOCALE_NAMESPACE}':`), `locale.d.ts 必须声明命名空间 '${LOCALE_NAMESPACE}'`)
    const missing = ZH_KEYS.filter(key => !source.includes(`'${key}'`))
    assert.deepEqual(missing, [], 'locale.d.ts 缺字典键（t() 的键会失去类型检查）')
  })

  it('tab 注册表与 i18n 应该对齐：每个 tab 都有标签键，可见 / 溢出两份覆盖全部 tab', async () => {
    const tabs = DESK_TABS.map(entry => entry.tab).sort()
    assert.deepEqual(tabs, ['notebook', 'notes', 'schedule', 'sessions', 'tasks'], '每个功能标签都要在 tab 注册表里')
    const missingLabels = DESK_TABS
      .filter(entry => !(entry.labelKey in ZH) || !(entry.labelKey in EN))
      .map(entry => entry.labelKey)
    assert.deepEqual(missingLabels, [], 'tab 标签键必须在 zh / en 字典里')
    const partitioned = [...VISIBLE_TABS, ...OVERFLOW_TABS].map(entry => entry.tab).sort()
    assert.deepEqual(partitioned, tabs, '可见 tab + 溢出 tab 必须恰好覆盖 tab 注册表')
  })
})
