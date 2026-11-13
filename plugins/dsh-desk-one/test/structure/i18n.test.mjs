// @ts-check
/**
 * i18n contract: the zh / en dictionaries are two views of the same key set, and the TypeScript
 * locale augmentation must DERIVE from the dictionary instead of carrying a second handwritten key
 * union (otherwise `t('…')` silently stops type-checking on a missed key). Copy itself is free to
 * change; keys and placeholder slots are the contract.
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

  it('locale.d.ts 应该从字典派生命名空间键集（不得手写第二份 key 联合）', async () => {
    const [augmentation, i18n] = await Promise.all([read('src/client/locale.d.ts'), read('src/client/i18n.ts')])
    assert.match(i18n, /export type DeskLocaleKey = keyof typeof ZH/u, 'i18n.ts 必须从 zh 字典导出 DeskLocaleKey')
    assert.match(
      augmentation,
      /import type \{[^}]*\bDeskLocaleKey\b[^}]*\} from '\.\/i18n\.js'/u,
      'locale.d.ts 必须从 ./i18n.js 导入派生类型 DeskLocaleKey',
    )
    assert.match(
      augmentation,
      new RegExp(`'${LOCALE_NAMESPACE}':\\s*DeskLocaleKey`, 'u'),
      `locale.d.ts 的 '${LOCALE_NAMESPACE}' 命名空间值必须是派生的 DeskLocaleKey`,
    )
    assert.doesNotMatch(augmentation, /\|\s*'[A-Za-z][^'\n]*'/u, 'locale.d.ts 不得再手写 key 联合（必须从字典派生）')
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
