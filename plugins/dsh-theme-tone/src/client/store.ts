/**
 * 设置行的槽位 store：镜像「当前明暗轴 + 该轴选中的色调」。与官方外观行同构：apply 世界的两个订阅是
 * 唯一写入方，行组件只读；`revision` 单调递增并由 `sync` 守卫，使「注册后立刻补一次 sync」不与真实事件互相覆盖。
 */

import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { ColorScheme, ToneId } from '../tones.js'

/** 行的渲染状态。 */
export interface ThemeToneRowState {
  /** 当前解析出的明暗轴（`system` 已由 ui-theme 解析）——决定渲染哪一轴的立方块。 */
  colorScheme: ColorScheme
  tone: ToneId
  /** 快照序号；-1 起步使首次 sync 必定落成一次变更。 */
  revision: number
}

/** 写入面。 */
type ThemeToneRowActions = {
  sync: (draft: ThemeToneRowState, colorScheme: ColorScheme, tone: ToneId, revision: number) => void
}

/**
 * 声明设置行的状态与写入面。⚠️ **初值不能写死 `'dark'`**：首次同步之前渲染过的那一帧会让浅色页面先画出
 * **深色轴卡片**，用户此时点下去就写进深色字段（两轴合法集合不重叠 → 被 schema 拒绝）。故按调用方传进来的
 * 当前轴初始化；`revision: -1` 仍保证首次 `sync` 必定落成一次变更。
 */
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
