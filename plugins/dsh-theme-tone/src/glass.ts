import { ABOVE_CONTENT_Z_INDEX, PLAIN_ATTR, RIGHT_PANEL_ATTR } from './constants.js'
import { BACKDROP_GRADIENTS } from './backdrop.js'

export const HEADER_HEIGHT_PX = 76
/** 所有磨砂玻璃面共用的填充不透明度（统一参数；越小白越通透，模糊参数统一走官方 token）。 */
export const GLASS_FILL_ALPHA = 0.45
export const SEAT_BAND_PX = 44

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
const SEAT = `:is([data-phase='active'], [data-phase='hero']) [data-composer-seat]`

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

/* ===== 输入框：完整玻璃模糊 + 座位透明 =====
   座位撤掉官方 36px 实色渐隐，正文从玻璃下滚过；卡片本体透明、玻璃与边缘光在 ::before（伪元素没有
   后代，不会成为官方弹层的 backdrop root）；卡片自成层叠上下文，::before 的 z-index:-1 才留得住。
   官方菜单材质完全保持原样。 */
${P} ${SEAT} {
  background: none !important;
}
${P} ${SEAT} [data-composer-card] {
  position: relative;
  z-index: 0;
  background-color: transparent;
  /* 「+」等 selector 型图标按钮：官方给的是不透明中性底，在玻璃卡片上会读成一块实心。 */
  --dsw-specific-selector: transparent;
}
${P} ${SEAT} [data-composer-card]::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  pointer-events: none;
  background-color: color-mix(in srgb, var(--dsw-specific-input-major) ${GLASS_FILL_ALPHA * 100}%, transparent);
  box-shadow: ${RIM_DARK};
  backdrop-filter: var(--dsw-menu-backdrop-filter);
}
body:not([data-ds-dark-theme]) ${SEAT} [data-composer-card]::before {
  box-shadow: ${RIM_LIGHT};
}
/* 停靠卡（todo / goal / queue）与输入框之间是 composerStack 的 --dsh-composer-stack-gap 缝隙：
   本插件把座位做成透明后，这条缝隙会露出没有材质的透明缝。用卡片同款玻璃把它补上（宽度与卡片对齐，
   用官方 --dsh-composer-side-clearance 对齐两侧留白），缝隙与卡片读作同一块玻璃。 */
${P} ${SEAT}:has([data-testid='todo-panel'], [data-queue-dock], [data-goal-bar]) *:has(> [data-composer-card]) {
  position: relative;
  z-index: 0;
}
${P} ${SEAT}:has([data-testid='todo-panel'], [data-queue-dock], [data-goal-bar]) *:has(> [data-composer-card])::before {
  content: '';
  position: absolute;
  top: calc(-1 * var(--dsh-composer-stack-gap, 6px));
  left: var(--dsh-composer-side-clearance, 16px);
  right: var(--dsh-composer-side-clearance, 16px);
  height: var(--dsh-composer-stack-gap, 6px);
  z-index: -1;
  pointer-events: none;
  background-color: color-mix(in srgb, var(--dsw-specific-input-major) ${GLASS_FILL_ALPHA * 100}%, transparent);
  backdrop-filter: var(--dsw-menu-backdrop-filter);
}

/* 卡片下方滚过的正文用「地面同源」的一小段盖住；带顶被卡片盖住，不需要 mask。 */
${P} [data-phase='active'] [data-composer-seat]::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: ${SEAT_BAND_PX}px;
  z-index: -1;
  pointer-events: none;
  background-color: var(--dsw-alias-bg-base);
${viewportLight('100% 100%')}
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
