/**
 * `theme-tone` locale 命名空间的 zh / en 字典。
 *
 * 标签走**意境名**而不是「深红 / 白蓝」这类直白色名 —— 颜色本身已经由卡片的
 * 所见即所得底色表达（见 `backdrop.ts` 的 `tonePreview`），标签只负责给氛围定名。
 *
 * **中文标签一律两个字**（默认 / 深空 / 余烬 / 幽林 / 樱花 / 霜蓝 / 苔青）——
 * `official` 原来是「官方默认」四个字，owner 要求改回「默认」：四个字在一排两字标签里
 * 会把整行的文字节奏带歪（与英文那条字母数规则同一个理由）。由 `test/tones.test.mjs` 钉住。
 *
 * **英文标签一律单个单词**（`Space` / `Ember` / `Glade` / `Sakura` / `Frost` / `Moss`）——
 * 由 `test/tones.test.mjs` 钉住。多数落在 4–5 字母，**`Sakura` 是 6 字母的例外**
 * （owner 把「素白 / Chalk」改成樱花粉时一并定的名；它是「樱花」最直接的英文，
 * 仍是单个单词。若日后要严格回 5 字母，替代候选是 `Petal`）。
 *
 * 但**保真优先于节奏**：`Void`（虚空）曾因凑节奏被选中，语义上偏离「深空」被 owner 退回；
 * 现用 `Space`。「深空」在英文里没有恰好对应的单词，`Space` 是最接近的那个（深空 = deep space
 * 的核心词，只丢了 "deep"，而深浅本来由卡面自己表达）。
 *
 * 每个色调 id 都必须有标签（`tone.<id>`）——**留位色也先备好**，这样上线一款
 * 只需翻 `available`，不会出现渲染出原始 key 的尴尬。完整性由
 * `test/tones.test.mjs` 的「每个色调 id 都有双语标签」用例钉住。
 */

import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** 简体中文字典（键集的事实来源）。 */
export const zh = {
  'title': '色调',
  'tone.official': '默认',
  'tone.violet': '深空',
  'tone.crimson': '余烬',
  'tone.forest': '幽林',
  'tone.sakura': '樱花',
  'tone.blue': '霜蓝',
  'tone.green': '苔青',
} satisfies Record<string, string>

/** 本命名空间的键联合。 */
export type ThemeToneKey = keyof typeof zh

/** 英文字典，按 zh 键集校验完整性。 */
export const en = {
  'title': 'Tone',
  'tone.official': 'Default',
  'tone.violet': 'Space',
  'tone.crimson': 'Ember',
  'tone.forest': 'Glade',
  'tone.sakura': 'Sakura',
  'tone.blue': 'Frost',
  'tone.green': 'Moss',
} satisfies Record<ThemeToneKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 色调设置行的文案。 */
    'theme-tone': ThemeToneKey
  }
}
