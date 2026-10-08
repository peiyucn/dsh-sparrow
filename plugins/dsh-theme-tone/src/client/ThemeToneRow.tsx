/**
 * 「色调」设置行：注册进「设置 → 常规」外观区条目槽（官方外观 order 10、字号 11，本行 10.5 插在两者之间）。
 * 只渲染**当前明暗轴上 `available` 的色调**，顺序 = `toneIdsFor(scheme)` 的插入顺序（两轴逐位对应）；
 * 留位色在色调表里已备好键与标签但不渲染 —— 上线一款只需把它的 `available` 翻成 true。
 * 选中态读持久化设置，不读解析后的活动主题。
 */

import type { ReactNode } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { GRAIN_ATTR } from '../constants.js'
import { tonePreview } from '../backdrop.js'
import { availableToneIds, toneFor, type ColorScheme, type ToneId } from '../tones.js'
import type { createThemeToneRowStore } from './store.js'
import { ROW_CLASS } from './styles.js'

/** 注入的业务面：色调写入。 */
export interface ThemeToneRowInjected {
  /** 写指定明暗轴的色调选择。⚠️ **轴必须由调用方传入（= 正在渲染这批卡片的那个轴），不能在写入时
   * 重新查询**：错开就会把浅色轴的 id 写进深色轴字段，而两轴合法集合**不重叠** ⇒ schema 拒绝、不生效。 */
  setTone: (id: ToneId, scheme: ColorScheme) => void
}

/** 完整组件 props：运行时份额 + store 份额 + locale 座位 + 注入面。 */
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
            /* 所见即所得：卡片底色 + 顶部/底部染色 = 这个色调铺满整屏的样子 */
            style={tonePreview(colorScheme, id)}
            /* 颗粒开关读色调自己的 grain；样式表按这个属性决定 ::after 显不显 */
            {...{ [GRAIN_ATTR]: toneFor(colorScheme, id).grain ? 'on' : 'off' }}
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
