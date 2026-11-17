

import type { ReactNode } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { tonePreview } from '../backdrop.js'
import { availableToneIds, type ColorScheme, type ToneId } from '../tones.js'
import type { createThemeToneRowStore } from './store.js'
import { ROW_CLASS } from './styles.js'


export interface ThemeToneRowInjected {

  setTone: (id: ToneId, scheme: ColorScheme) => void
}


export type ThemeToneRowComponentProps =
  PropsRuntime<'settings.general.item'> &
  PropsStore<ReturnType<typeof createThemeToneRowStore>> &
  PropsLocale<'theme-tone'> &
  ThemeToneRowInjected

export function ThemeToneRow({ t, useStore, setTone }: ThemeToneRowComponentProps): ReactNode {
  const colorScheme = useStore(store => store.colorScheme)
  const tone = useStore(store => store.tone)
  return (
    <div className={ROW_CLASS.group}>
      <div className={ROW_CLASS.title}>{t('title')}</div>
      <div className={ROW_CLASS.cubeRow}>
        {availableToneIds(colorScheme).map(id => (
          <button
            key={id}
            type="button"
            className={id === tone ? `${ROW_CLASS.cube} ${ROW_CLASS.selected}` : ROW_CLASS.cube}

            style={tonePreview(colorScheme, id)}
            aria-pressed={id === tone}
            onClick={() => { setTone(id, colorScheme) }}
          >
            {t(`tone.${id}`)}
          </button>
        ))}
      </div>
    </div>
  )
}
