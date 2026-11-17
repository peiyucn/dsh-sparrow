

import type {} from '@deepseek-ai/dsh-client-ui-slots'


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


export type ThemeToneKey = keyof typeof zh


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

    'theme-tone': ThemeToneKey
  }
}
