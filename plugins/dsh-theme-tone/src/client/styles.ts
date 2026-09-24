/**
 * 设置行的样式表（纯 CSS 文本，由 client half 注入）。
 *
 * 视觉语言对齐官方外观行（`ui-theme/src/client/AppearanceRow.module.css`：
 * group / title / cubeRow / themeCube / selected 五条声明），但用本插件自己的
 * 类名前缀 —— 不复刻官方 hashed 类名、不依赖官方 DOM 结构。
 */

import { BACKDROP_CLASS, GRAIN_ALPHA_VARIABLE, GRAIN_ATTR } from '../constants.js'
import { GRAIN_DATA_URI, GRAIN_OPACITY } from '../backdrop.js'

/** 行的类名（对外导出给组件用，避免两处各写一遍字符串）。 */
export const ROW_CLASS = Object.freeze({
  group: `${BACKDROP_CLASS}-group`,
  title: `${BACKDROP_CLASS}-title`,
  cubeRow: `${BACKDROP_CLASS}-cube-row`,
  cube: `${BACKDROP_CLASS}-cube`,
  selected: `${BACKDROP_CLASS}-cube-selected`,
})

/**
 * 设置行的样式表文本。
 * @returns 注入 `<style>` 的 CSS 文本。
 */
export function buildRowCss(): string {
  const { group, title, cubeRow, cube, selected } = ROW_CLASS
  return `/* dsh-theme-tone 设置行（视觉对齐官方外观行；卸载即随样式表移除） */
.${group} {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}
.${title} {
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
}
.${cubeRow} {
  display: flex;
  /* 一行到底。不能换行：4 张卡放不下时换行会让落单的那张被 flex-grow 拉满整行
     （实测踩过 —— Ember 之后 Glade 独占第二行且撑到全宽）。 */
  flex-wrap: nowrap;
  align-items: stretch;
  gap: 8px;
}
.${cube} {
  box-sizing: border-box;
  display: flex;
  /* 等分且可收缩：4 张卡恒在一行，宽度随容器自适应（不用固定 basis，否则又会换行）。 */
  flex: 1 1 0;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  /*
   * 与官方「外观」卡（AppearanceRow 的 themeCube）**等高**：
   *   padding 20×2 + 图标 16 + gap 4 + 文字行高 22 + 边框 0.5×2 = 83px
   * 本卡只有文字（无图标），故用 min-height 把这个高度钉住，而不是靠内容撑。
   * 高度也别再压低：卡太扁时顶部 / 底部的染色会挤出盒外，卡面退化成纯色。
   */
  min-height: 83px;
  padding: 20px 12px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: 20px;
  /* 给颗粒层做定位与裁剪；isolate 让颗粒只在卡内混合，不渗到卡片外面去 */
  position: relative;
  overflow: hidden;
  isolation: isolate;
  /* 底色与染色由组件的 inline style 给（所见即所得预览）——inline 优先级高于样式表，
     所以悬停 / 选中态只能用边框与内描边表达，不能改背景。 */
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  cursor: pointer;
}
/* 卡面颗粒：与实况背景层同一条纹理、同一不透明度、同一 screen 混合。
   深色轴的「质感」就是这一层 —— 卡面缺了它，深色三张就只剩两块平色。 */
.${cube}::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: var(${GRAIN_ALPHA_VARIABLE}, ${GRAIN_OPACITY});
  background-image: ${GRAIN_DATA_URI};
  mix-blend-mode: screen;
}
/* 官方默认与浅色轴不叠颗粒（与实况一致：grain 只对深色轴开） */
.${cube}[${GRAIN_ATTR}='off']::after {
  display: none;
}
.${cube}:hover:not(.${selected}) {
  border-color: var(--dsw-alias-label-secondary);
}
/* 选中：一层描边环。用 label-primary 是因为它在本轴内一定与色调卡对比
   （暗色轴上是近白、浅色轴上是近黑，而卡片正是该轴的深 / 浅色）。 */
.${selected} {
  border-color: var(--dsw-alias-label-primary);
  box-shadow: inset 0 0 0 1.5px var(--dsw-alias-label-primary);
}
`
}
