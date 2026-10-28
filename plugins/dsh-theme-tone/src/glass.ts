import { ABOVE_CONTENT_Z_INDEX, PLAIN_ATTR, RIGHT_PANEL_ATTR } from './constants.js'
import { BACKDROP_GRADIENTS } from './backdrop.js'

export const HEADER_HEIGHT_PX = 76
/** 玻璃面共用的填充不透明度（统一参数；越小白越通透）。 */
export const GLASS_FILL_ALPHA = 0.45
/** 玻璃面共用的模糊参数（统一；2026-10-27 从官方 40px 调低，原值观感过糊）。 */
export const GLASS_BLUR = 'blur(20px) saturate(150%)'

/** 右栏顶部两条 38px 带的合成高度（dockkit 条 + 各标签自己的头行）。 */
export const PANEL_BAND_PX = 38
const PANEL_SCROLLER_LIFT_PX = PANEL_BAND_PX * 2

/** 输入框玻璃：active 单板 / hero 悬浮卡共用的材质。 */
export const COMPOSER_FILL_ALPHA = 0.58
export const COMPOSER_BLUR = 'blur(14px) saturate(140%)'
/**
 * hero 悬浮卡的边缘高光：全周 1px 内描边 + 上下柔光（不用径向渐变，四角不断光）。
 */
export const COMPOSER_RIM_DARK = 'inset 0 1px 0 rgba(255, 255, 255, 0.12), inset 1px 0 0 rgba(255, 255, 255, 0.05), inset -1px 0 0 rgba(255, 255, 255, 0.03), inset 0 -1px 0 rgba(255, 255, 255, 0.04)'
export const COMPOSER_RIM_LIGHT = 'inset 0 1px 0 rgba(255, 255, 255, 0.40), inset 1px 0 0 rgba(255, 255, 255, 0.16), inset -1px 0 0 rgba(0, 0, 0, 0.04), inset 0 -1px 0 rgba(0, 0, 0, 0.04)'
export const COMPOSER_SHEEN_DARK = 'linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.015) 6%, transparent 16%, transparent 84%, rgba(255, 255, 255, 0.03) 94%, rgba(255, 255, 255, 0.04) 100%)'
export const COMPOSER_SHEEN_LIGHT = 'linear-gradient(180deg, rgba(255, 255, 255, 0.22) 0%, transparent 18%, transparent 82%, rgba(255, 255, 255, 0.12) 100%)'

/**
 * active 单板：顶部 / 两侧 specular，底部到底边不加光；外加一层向上的柔和投影。
 * 板内分组用 1px 顶部高光线分隔（box-shadow 不占布局）。
 */
export const SLAB_RIM_DARK = 'inset 0 1px 0 rgba(255, 255, 255, 0.16), inset 1px 0 0 rgba(255, 255, 255, 0.06), inset -1px 0 0 rgba(255, 255, 255, 0.05), 0 -10px 30px -18px rgba(0, 0, 0, 0.6)'
export const SLAB_RIM_LIGHT = 'inset 0 1px 0 rgba(255, 255, 255, 0.55), inset 1px 0 0 rgba(255, 255, 255, 0.25), inset -1px 0 0 rgba(0, 0, 0, 0.04), 0 -10px 30px -18px rgba(31, 35, 60, 0.18)'
export const SLAB_SHEEN_DARK = 'linear-gradient(180deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.02) 12%, transparent 26%)'
export const SLAB_SHEEN_LIGHT = 'linear-gradient(180deg, rgba(255, 255, 255, 0.5) 0%, transparent 30%)'
export const GROUP_LINE_DARK = '0 -1px 0 rgba(255, 255, 255, 0.07)'
export const GROUP_LINE_LIGHT = '0 -1px 0 rgba(0, 0, 0, 0.06)'

/** 与地面层同源的光：显式视口尺寸 + 定位，禁止 `background-attachment: fixed`。 */
function viewportLight(position: string, size = '100vw 100vh'): string {
  return `  background-image: ${BACKDROP_GRADIENTS};
  background-size: ${size};
  background-position: ${position};
  background-repeat: no-repeat;`
}

/** 玻璃面的填充：底色 × 给定不透明度。 */
function glassFill(alpha: number): string {
  return `  background-color: color-mix(in srgb, var(--dsw-alias-bg-base) ${alpha * 100}%, transparent);`
}

const OBJECT_FIT_LIGHT = viewportLight('0 0', '100% 100%')

const P = `body:not([${PLAIN_ATTR}])`
const RP = `[${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane]`

/** 右栏 76px 下有「可流式滚动的正文」的标签：只有它们上提滚区，正文才会真的从两条带下滚过。 */
const LIFTED_SCROLLS = [
  `${P} ${RP} [data-textpreview-state='text'][data-document-preview$='/markdown'] [data-textpreview-body]`,
  `${P} ${RP} [data-textpreview-state='text'][data-document-preview$='/text'] [data-textpreview-body]`,
  `${P} ${RP} [data-files-state='tree'] [data-files-body]`,
].join(',\n')

/** 各标签自己的 38px 头行（玻璃面挂在它们的 ::before 上，向上铺满 0..76）。 */
const PANEL_HEADERS = [
  `${P} ${RP} [data-files-state='tree'] > *:first-child`,
  `${P} ${RP} [data-textpreview-state='unsupported'] > *:first-child`,
  `${P} ${RP} [data-textpreview-state='text'] > *:first-child:not([data-textpreview-changed]):not([data-textpreview-meta-failed])`,
  `${P} ${RP} [data-textpreview-state='text'] > [data-textpreview-changed] + *`,
  `${P} ${RP} [data-textpreview-state='text'] > [data-textpreview-meta-failed] + *`,
].join(',\n')

export function buildGlassCss(): string {
  return `/* ===== 对话区顶栏：浮层化 + 玻璃 ===== */
${P} [data-phase='active'] { position: relative; }
${P} [data-phase='active'] [data-slot='conversation.header'] > header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: ${ABOVE_CONTENT_Z_INDEX};
}
${P} [data-phase='active'] [data-slot='conversation.header'] > header::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  border-radius: inherit;
${glassFill(GLASS_FILL_ALPHA)}
${viewportLight('100% 0')}
  backdrop-filter: ${GLASS_BLUR};
}
${P} [data-phase='active'] [data-conversation-scroll] {
  padding-top: ${HEADER_HEIGHT_PX}px;
}
${P} [data-phase='active'] [data-conversation-scroll]::-webkit-scrollbar-track {
  margin: calc(${HEADER_HEIGHT_PX}px + 2px) 2px 2px;
}
${P} [data-phase='active'] [data-width-handle] {
  top: ${HEADER_HEIGHT_PX}px;
}

/* ===== 输入框玻璃 =====
   active：整块「液态玻璃板」—— 从 composer stack 顶部贯通到视口底，唯一一层 backdrop-filter；
   顶部圆角、底部直角；dock 卡 / 输入区 / 统计胶囊全部透明化，成为板内行。
   hero：保持居中悬浮的输入玻璃卡（材质 + 边缘高光），不贯通。 */
${P} [data-phase='active'] [data-composer-seat] {
  background: none !important;
}
${P} [data-phase='active'] [data-composer-seat]::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: min(calc(100% - 2 * var(--dsh-composer-side-clearance, 16px)), var(--dsh-composer-card-max-width));
  z-index: -1;
  pointer-events: none;
  border-radius: var(--dsw-radius-panel) var(--dsw-radius-panel) 0 0;
  background-color: color-mix(in srgb, var(--dsw-specific-input-major) ${COMPOSER_FILL_ALPHA * 100}%, transparent);
  background-image: ${SLAB_SHEEN_DARK};
  box-shadow: ${SLAB_RIM_DARK};
  backdrop-filter: ${COMPOSER_BLUR};
}
body:not([${PLAIN_ATTR}]):not([data-ds-dark-theme]) [data-phase='active'] [data-composer-seat]::before {
  background-image: ${SLAB_SHEEN_LIGHT};
  box-shadow: ${SLAB_RIM_LIGHT};
}
${P} [data-phase='active'] [data-composer-card] {
  position: relative;
  z-index: 0;
  background-color: transparent;
  box-shadow: ${GROUP_LINE_DARK};
  border-radius: 0;
  /* 「+」等 selector 型按钮：官方给的是不透明中性底，在玻璃上会读成一块实心。 */
  --dsw-specific-selector: transparent;
}
${P} [data-phase='active'] [data-composer-seat] [data-composer-dock] {
  width: 100%;
  max-width: var(--dsh-composer-card-max-width);
  box-shadow: ${GROUP_LINE_DARK};
}
/* dock 卡（todo / goal / queue）去材质、去圆角，成为板内行；交互全部保留。 */
${P} [data-phase='active'] [data-composer-seat] :is([data-queue-dock], [data-goal-bar], [data-testid='todo-panel']) {
  background: transparent;
  box-shadow: ${GROUP_LINE_DARK};
  border-radius: 0;
  backdrop-filter: none;
}
/* 浅色轴：同一条分组线换成深色低透明度。 */
body:not([${PLAIN_ATTR}]):not([data-ds-dark-theme]) [data-phase='active'] [data-composer-card],
body:not([${PLAIN_ATTR}]):not([data-ds-dark-theme]) [data-phase='active'] [data-composer-seat] :is([data-queue-dock], [data-goal-bar], [data-testid='todo-panel'], [data-composer-dock]) {
  box-shadow: ${GROUP_LINE_LIGHT};
}
${P} [data-phase='active'] [data-composer-seat] :is([data-queue-dock], [data-goal-bar], [data-testid='todo-panel']) > * {
  background: transparent;
  box-shadow: none;
  border-radius: 0;
  backdrop-filter: none;
}
${P} [data-phase='active'] [data-composer-seat] :is([data-queue-dock], [data-goal-bar]) > *::before,
${P} [data-phase='active'] [data-composer-seat] :is([data-queue-dock], [data-goal-bar]) > *::after {
  content: none;
}

/* hero：保持悬浮输入卡（材质 + 边缘高光） */
${P} [data-phase='hero'] [data-composer-seat] {
  background: none !important;
}
${P} [data-phase='hero'] [data-composer-card] {
  position: relative;
  z-index: 0;
  background-color: color-mix(in srgb, var(--dsw-specific-input-major) ${COMPOSER_FILL_ALPHA * 100}%, transparent);
  --dsw-specific-selector: transparent;
}
${P} [data-phase='hero'] [data-composer-card]::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  pointer-events: none;
  background-image: ${COMPOSER_SHEEN_DARK};
  box-shadow: ${COMPOSER_RIM_DARK};
  backdrop-filter: ${COMPOSER_BLUR};
}
body:not([data-ds-dark-theme]) [data-phase='hero'] [data-composer-card]::before {
  background-image: ${COMPOSER_SHEEN_LIGHT};
  box-shadow: ${COMPOSER_RIM_LIGHT};
}

/* ===== 右边栏：底色 + 打光（玻璃面不挂 pane 本体，避免采样到自己的子内容） ===== */
${P} ${RP} {
  background-color: var(--dsw-alias-bg-base);
${viewportLight('100% 0')}
}

/* 真磨砂的前提：正文必须从两条 38px 带下面滚过去。官方把「带 0..76」与「滚区 76..底」排成上下
   相邻的两个盒子 ⇒ 带背后永远只有面板纯色。把可流式滚动的正文上提 76px、内容下移 76px（只改视觉
   位置），头部在流内占的高度再用负底距还回去 —— 正文于是真的从玻璃带下滚过，模糊才有内容可糊。 */
${LIFTED_SCROLLS} {
  /* !important：官方的滚动条轨道规则（::-webkit-scrollbar-track）在 Chromium 里会以更高的
     伪元素特异性参与元素自身 margin 的竞争，把上提量顶回 78px；这里必须压过去。 */
  margin-top: -${PANEL_SCROLLER_LIFT_PX}px !important;
}
${P} ${RP} [data-textpreview-state='text'][data-document-preview$='/markdown'] [data-textpreview-body] > * > *,
${P} ${RP} [data-textpreview-state='text'][data-document-preview$='/text'] [data-textpreview-body] > * > *,
${P} ${RP} [data-textpreview-state='text'][data-document-preview$='/markdown'] [data-textpreview-body] > [data-document-loading],
${P} ${RP} [data-textpreview-state='text'][data-document-preview$='/markdown'] [data-textpreview-body] > [data-textpreview-failed],
${P} ${RP} [data-textpreview-state='text'][data-document-preview$='/markdown'] [data-textpreview-body] > [data-textpreview-more],
${P} ${RP} [data-textpreview-state='text'][data-document-preview$='/text'] [data-textpreview-body] > [data-document-loading],
${P} ${RP} [data-textpreview-state='text'][data-document-preview$='/text'] [data-textpreview-body] > [data-textpreview-failed],
${P} ${RP} [data-textpreview-state='text'][data-document-preview$='/text'] [data-textpreview-body] > [data-textpreview-more],
${P} ${RP} [data-files-state='tree'] [data-files-body] > * {
  transform: translateY(${PANEL_SCROLLER_LIFT_PX}px);
}
${P} ${RP} > *:first-child {
  margin-bottom: -${PANEL_BAND_PX}px;
}
${P} ${RP} > *:last-child > [data-sidebar-right-tab] {
  padding-top: ${PANEL_BAND_PX}px;
  box-sizing: border-box;
}
${LIFTED_SCROLLS}::-webkit-scrollbar-track {
  margin: calc(${HEADER_HEIGHT_PX}px + 2px) 2px 2px;
}

/* 每条带的玻璃面：挂在各标签自己的 38px 头行上，向上铺满 0..76（两个面盒子重合，y=38 不出缝）；
   top 用负 38px、bottom 用 0（止于内边距盒底）—— 写死 76px 会把官方头行的 1px 下边框一起洗掉。 */
${PANEL_HEADERS} {
  position: relative;
  z-index: 2;
}
${PANEL_HEADERS.split(',\n').map(selector => `${selector}::before`).join(',\n')} {
  content: '';
  position: absolute;
  top: -${PANEL_BAND_PX}px;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: -1;
  pointer-events: none;
${glassFill(GLASS_FILL_ALPHA)}
${viewportLight('100% 0')}
  backdrop-filter: ${GLASS_BLUR};
}
/* dockkit 条要压在头行的面上：否则条内标签 / 加号 / 关闭按钮被那层填充压暗。 */
${P} [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-strip] {
  position: relative;
  z-index: 3;
}

/* ===== 设置弹窗：打光（按弹窗自身盒子缩放，窗口在视口中间，不按视口相位画） ===== */
${P} [data-shortcut-modal='settings'] {
${OBJECT_FIT_LIGHT}
}

`
}
