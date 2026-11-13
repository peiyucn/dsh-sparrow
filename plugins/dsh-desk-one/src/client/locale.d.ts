/**
 * desk-one locale namespace augmentation. The key union derives from the zh dictionary in
 * `./i18n.js`, so the typed `t()` keys and the runtime dictionaries share one source of truth:
 * adding or removing a key never needs a hand-edited second copy in this file.
 */
import type { DeskLocaleKey } from './i18n.js'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'desk-one': DeskLocaleKey
  }
}

export {}
