/**
 * 浮层 / 卡片的**表面处理** —— 2026-10-27 起「做减法」：**只吃颜色，不再叠我们的光层**。
 *
 * 历史：本模块曾给菜单族 / 对话框 / 树弹层 / 任务列表 / 提示条 / 问答卡 / 停靠卡各叠三层 `::after` 光
 * （`surfaceLayers()`：顶光 / 底光 / 左光）。后果是「有的浮层有打光、有的没」「同一菜单内外两层光」，
 * 而且每个面都多一个负 z 伪元素层（合成与维护成本都跟着涨）。owner 三轮反馈后定案：
 * **官方已经把菜单族统一到 `MenuSurface`、停靠卡也有自己的材质**，我们不再自己画 —— 浮层的色相由
 * `tones.ts` 的 token 覆盖负责（`POPUP_TOKENS` / `--dsw-specific-*`），本模块只剩两件「必须由选择器做」的事：
 *
 * 1. **悬停卡**（`HoverCard`）：官方把面与字都写死成两轴同值，只改 token 不生效 ⇒ 面走 {@link PANEL_VARIABLE}、
 *    字改成主题感知的 label token（否则浅色轴白底白字）。
 * 2. **输入框卡片里的圆形图标按钮**：官方默认底是不透明实色，坐在卡片上读成两块塑料片 ⇒ 置透明、只留 hover 底。
 */

import { HOVER_CARD_ANCHOR, HOVER_CARD_TEXT_TOKENS, PANEL_VARIABLE } from './constants.js'

/** **输入框卡片里那两个圆形图标按钮**（`+` 命令面板 / 附件）—— 默认去掉底色、只保留 hover 底。
 *  ⚠️ **覆盖范围仍然收在卡片里**（不写 `body`）：这 token 语义上是「选择器底色」，官方将来若给别的组件也接上，
 *  写 `body` 会误伤；收在卡片内则永不外溢。 */
export const COMPOSER_ICON_BUTTON_SCOPE = 'body [data-composer-card]'

/** 浮层样式表文本（**只做两件事**：悬停卡面/字跟随主题；卡片内图标按钮去底）。
 *  @returns 注入 `<style>` 的 CSS 文本。 */
export function buildSurfaceCss(): string {
  return `/* ===== dsh-theme-tone 浮层（2026-10-27 起不再叠光层；只做 token 覆盖不到的几处） ===== */
/* --- 悬停卡：官方把**面和字都写死了**（两轴同值），这里跟随主题 —— 全插件**不带官方默认门**的规则之一
   （两个档都修，缘由见 constants.ts 的 HOVER_CARD_ANCHOR）；面走 ${PANEL_VARIABLE}，官方默认档下正是官方自己的 layer3。 --- */
${HOVER_CARD_ANCHOR} {
  /* ⚠️ 这条规则不带门 ⇒ token 层未就绪（loading 窗口 / overrideTokens 抛错重试之前）时它也照常生效，
     故面板色必须给**官方兜底**：没有兜底时 var() 解析为空、卡片会变成**全透明**，比不生效更糟；
     兜底取官方 layer-3 —— 正是「这个档下本来该有的那个面」。（本段不能出现反引号与色值字面量。） */
  background-color: var(${PANEL_VARIABLE}, var(--dsw-alias-bg-layer-3)) !important;
}
/* 字色：官方写死的浅字必须一起换成**主题感知**的 label token（否则浅卡配浅字仍是白底白字），按稳定后缀匹配。 */
${HOVER_CARD_TEXT_TOKENS.map(({ suffix, token }) => `${HOVER_CARD_ANCHOR} [class*='${suffix}'] {
  color: var(${token}) !important;
}`).join('\n')}
/* --- 输入框卡片里的**圆形图标按钮**（+ 命令 / 附件）：默认去底、保留 hover 底 --- */
${COMPOSER_ICON_BUTTON_SCOPE} {
  --dsw-specific-selector: transparent;
}
`
}
