import { ABOVE_CONTENT_Z_INDEX, PLAIN_ATTR, RIGHT_PANEL_ATTR } from './constants.js'
import { BACKDROP_GRADIENTS } from './backdrop.js'

export const HEADER_HEIGHT_PX = 76
export const HEADER_GLASS_ALPHA = 0.7
export const CARD_GLASS_ALPHA = 0.88

/** 右栏顶部两条 38px 带的合成高度（dockkit 条 + 各标签自己的头行）。 */
export const PANEL_BAND_PX = 38
const PANEL_SCROLLER_LIFT_PX = PANEL_BAND_PX * 2

/**
 * 玻璃边缘的固定高光：光是**有方向**的（光源在左上）——上缘亮、左缘弱亮、右缘暗、下缘暗。
 * 四边同亮会读成一圈描边，不是玻璃。
 */
const RIM_DARK = 'inset 0 1px 2px rgba(255, 255, 255, 0.16), inset 1px 0 2px rgba(255, 255, 255, 0.06), inset -1px 0 3px rgba(0, 0, 0, 0.18), inset 0 -1px 3px rgba(0, 0, 0, 0.12)'
const RIM_LIGHT = 'inset 0 1px 2px rgba(255, 255, 255, 0.72), inset 1px 0 2px rgba(255, 255, 255, 0.4), inset -1px 0 3px rgba(0, 0, 0, 0.05), inset 0 -1px 3px rgba(0, 0, 0, 0.04)'

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
${glassFill(HEADER_GLASS_ALPHA)}
${viewportLight('100% 0')}
  backdrop-filter: var(--dsw-menu-backdrop-filter);
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

/* ===== 输入框：玻璃卡片（不做 live blur）+ 座位光墙 =====
   一天逐项排除后的结论：输入框区域只要有 live backdrop-filter，模型菜单一开就会触发 Chromium 的
   快照错位（与采样内容无关、与「两层 blur 重叠」也无关；整页无 blur 时残影消失）。
   所以输入框去掉 live blur；同时因为不再有模糊去"糊掉"滚动内容，座位必须重新挡住正文，否则文字会
   互相叠在一起（owner 反馈）。做法：座位画一层「底色 + 地面光」的不透光墙（上缘 36px 渐隐，复刻
   官方让正文淡出的观感），卡片用高比例半透明填充 + 官方 elevation + 有方向边缘光，贴着光墙读作
   玻璃卡片。顶栏 / 右栏的 live blur 保留（不与菜单浮层重叠，未出现残影）。 */
${P} :is([data-phase='active'], [data-phase='hero']) [data-composer-seat] {
  background: none !important;
}
${P} :is([data-phase='active'], [data-phase='hero']) [data-composer-seat]::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-color: var(--dsw-alias-bg-base);
${viewportLight('100% 100%')}
  -webkit-mask-image: linear-gradient(180deg, transparent 0px, black 36px);
  mask-image: linear-gradient(180deg, transparent 0px, black 36px);
}
${P} :is([data-phase='active'], [data-phase='hero']) [data-composer-seat] [data-composer-card] {
  position: relative;
  background-color: color-mix(in srgb, var(--dsw-specific-input-major) ${CARD_GLASS_ALPHA * 100}%, transparent);
  box-shadow: var(--dsw-elevation-soft), ${RIM_DARK};
  /* 「+」等 selector 型图标按钮：官方给的是不透明中性底，在玻璃卡片上会读成一块实心。 */
  --dsw-specific-selector: transparent;
}
body:not([data-ds-dark-theme]) :is([data-phase='active'], [data-phase='hero']) [data-composer-seat] [data-composer-card] {
  box-shadow: var(--dsw-elevation-soft), ${RIM_LIGHT};
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
${glassFill(HEADER_GLASS_ALPHA)}
${viewportLight('100% 0')}
  backdrop-filter: var(--dsw-menu-backdrop-filter);
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
