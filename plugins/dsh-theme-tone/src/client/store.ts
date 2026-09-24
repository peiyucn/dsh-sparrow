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
 *
 * ⚠️ **初值不能写死 `'dark'`**（owner 真机报「浅色模式下选色调无法维持」的第三层根因）：
 * 行在 `apply` 里注册、`inject` 时补一次同步，但**首次同步之前**若渲染过一帧，
 * 写死 dark 会让浅色页面先画出**深色轴的卡片**；用户此时点下去就写进深色字段，
 * 而两轴合法集合不重叠 → 被 schema 拒绝。
 * 改成按**调用方传进来的当前轴**初始化（`apply` 处传 `ctx.theme` 的实时值），
 * 使首帧就与真实主题一致；`revision: -1` 仍保证首次 `sync` 必定落成一次变更。
 * @param scheme - 当前解析出的明暗轴（调用方应传实时主题；缺省回退 `dark`）。
 * @returns store 句柄（交给槽位注册的 `store` 座位）。
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
