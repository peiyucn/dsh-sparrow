/**
 * `theme-tone` locale 命名空间的 zh / en 字典。标签走**意境名**而不是直白色名（颜色已由卡片的所见即所得底色表达）：**中文标签一律两个字**、**英文标签一律单个单词**（`Sakura` 是 6 字母的例外），由 `test/tones.test.mjs` 钉住；但**保真优先于节奏**（`violet` 用 `Space` 而不是 `Void`）。
 * 每个色调 id 都必须有标签（`tone.<id>`，**留位色也先备好**），否则会渲染出原始 key —— 完整性同样由该测试钉住。
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
