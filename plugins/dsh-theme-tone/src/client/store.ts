

import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { ColorScheme, ToneId } from '../tones.js'


export interface ThemeToneRowState {

  colorScheme: ColorScheme
  tone: ToneId

  revision: number
}


type ThemeToneRowActions = {
  sync: (draft: ThemeToneRowState, colorScheme: ColorScheme, tone: ToneId, revision: number) => void
}


export function createThemeToneRowStore(
  scheme: ColorScheme = 'dark',
): EngineStoreHandle<ThemeToneRowState, ThemeToneRowActions> {
  return defineStore({
    init: (): ThemeToneRowState => ({ colorScheme: scheme, tone: 'official', revision: -1 }),
    actions: {
      sync: (d, colorScheme: ColorScheme, tone: ToneId, revision: number) => {
        if (revision <= d.revision) return
        d.colorScheme = colorScheme
        d.tone = tone
        d.revision = revision
      },
    },
  })
}
