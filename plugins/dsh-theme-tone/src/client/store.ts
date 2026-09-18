/**
 * 设置行的槽位 store：镜像「当前明暗轴 + 该轴选中的色调」。
 *
 * 与官方外观行同构（`ui-theme/src/client/settings-store.ts`）：apply 世界的两个订阅
 * 是唯一写入方，行组件只读。`revision` 单调递增并由 `sync` 守卫，
 * 使「注册后立刻补一次 sync」不会与随后的真实事件互相覆盖。
 */

import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { ColorScheme, ToneId } from '../tones.js'

/** 行的渲染状态。 */
export interface ThemeToneRowState {
  /** 当前解析出的明暗轴（`system` 已由 ui-theme 解析）——决定渲染哪一轴的立方块。 */
  colorScheme: ColorScheme
  /** 当前轴上被选中的色调 id。 */
  tone: ToneId
  /** 快照序号；-1 起步使首次 sync 必定落成一次变更。 */
  revision: number
}

/** 写入面。 */
type ThemeToneRowActions = {
  sync: (draft: ThemeToneRowState, colorScheme: ColorScheme, tone: ToneId, revision: number) => void
}

/**
 * 声明设置行的状态与写入面。
 * @returns store 句柄（交给槽位注册的 `store` 座位）。
 */
export function createThemeToneRowStore(): EngineStoreHandle<ThemeToneRowState, ThemeToneRowActions> {
  return defineStore({
    init: (): ThemeToneRowState => ({ colorScheme: 'dark', tone: 'official', revision: -1 }),
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
