import { ABOVE_CONTENT_Z_INDEX, PLAIN_ATTR, RIGHT_PANEL_ATTR } from './constants.js'
import { BACKDROP_GRADIENTS } from './backdrop.js'

export const HEADER_HEIGHT_PX = 76
/** 所有磨砂玻璃面共用的填充不透明度（统一参数；越小白越通透，模糊参数统一走官方 token）。 */
export const GLASS_FILL_ALPHA = 0.45
/** 三处玻璃共用的模糊参数（统一；2026-10-27 从官方 40px 调低，原值观感过糊）。 */
export const GLASS_BLUR = 'blur(20px) saturate(150%)'
export const SEAT_BAND_PX = 44

/** 右栏顶部两条 38px 带的合成高度（dockkit 条 + 各标签自己的头行）。 */
export const PANEL_BAND_PX = 38
const PANEL_SCROLLER_LIFT_PX = PANEL_BAND_PX * 2

/**
 * 玻璃边缘的固定高光：四边同构造 —— 极淡基线 + 4px 柔光，都从边中点向两端衰减。
 * 上 / 下缘是主光：峰值 0.12、基线只留 0.03，两端更暗、明暗落差更大；
 * 左缘次之，右缘是背光侧、峰值最低。
 */
const RIM_DARK = 'inset 0 1px 2px rgba(255, 255, 255, 0.03), inset 1px 0 2px rgba(255, 255, 255, 0.04), inset -1px 0 3px rgba(0, 0, 0, 0.08), inset -1px 0 2px rgba(255, 255, 255, 0.04), inset 0 -1px 2px rgba(255, 255, 255, 0.03)'
const RIM_LIGHT = 'inset 0 1px 2px rgba(255, 255, 255, 0.06), inset 1px 0 2px rgba(255, 255, 255, 0.1), inset -1px 0 3px rgba(0, 0, 0, 0.03), inset -1px 0 2px rgba(255, 255, 255, 0.06), inset 0 -1px 2px rgba(255, 255, 255, 0.06)'

/**
 * 四缘柔光：4px，峰值 + 基线。上 / 下缘是主光（0.12 + 0.03，横向 42% 衰减），
 * 左缘 0.08、右缘 0.06（+0.04，纵向 42% 衰减）；四边都在中点最亮、向两端渐暗。
 */
const TOP_GLOW_DARK = 'radial-gradient(42% 100% at 50% 0%, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 40%, transparent 75%)'
const TOP_GLOW_LIGHT = 'radial-gradient(42% 100% at 50% 0%, rgba(255, 255, 255, 0.34) 0%, rgba(255, 255, 255, 0.1) 40%, transparent 75%)'
const BOTTOM_GLOW_DARK = 'radial-gradient(42% 100% at 50% 100%, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 40%, transparent 75%)'
const BOTTOM_GLOW_LIGHT = 'radial-gradient(42% 100% at 50% 100%, rgba(255, 255, 255, 0.34) 0%, rgba(255, 255, 255, 0.1) 40%, transparent 75%)'
const LEFT_GLOW_DARK = 'radial-gradient(100% 42% at 0% 50%, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.04) 50%, transparent 100%)'
const LEFT_GLOW_LIGHT = 'radial-gradient(100% 42% at 0% 50%, rgba(255, 255, 255, 0.28) 0%, rgba(255, 255, 255, 0.1) 50%, transparent 100%)'
const RIGHT_GLOW_DARK = 'radial-gradient(100% 42% at 100% 50%, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.03) 50%, transparent 100%)'
const RIGHT_GLOW_LIGHT = 'radial-gradient(100% 42% at 100% 50%, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.08) 50%, transparent 100%)'

/** 输入框卡片的悬浮阴影（投影方向朝下，读作离开页面）。 */
const CARD_SHADOW_DARK = '0 12px 32px -12px rgba(0, 0, 0, 0.55), 0 2px 8px rgba(0, 0, 0, 0.25)'
const CARD_SHADOW_LIGHT = '0 12px 32px -12px rgba(31, 35, 60, 0.18), 0 2px 8px rgba(31, 35, 60, 0.08)'

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

/** 停靠卡补缝：与地面层同源的背景重绘（fixed 背景定位区 = 视口，% 按视口解析）。 */
const GROUND_REPAINT = `  background-color: var(--dsw-alias-bg-base);
  background-image: ${BACKDROP_GRADIENTS};
  background-attachment: fixed;
  background-repeat: no-repeat;`
const DOCK = `[data-queue-dock], [data-goal-bar]`
const TODO = `[data-testid='todo-panel']`
const STACK_GAP = 'var(--dsh-composer-stack-gap, 6px)'
const SIDE_CLEARANCE = 'var(--dsh-composer-side-clearance, 16px)'

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
  box-shadow: ${CARD_SHADOW_DARK};
  /* 「+」等 selector 型图标按钮：官方给的是不透明中性底，在玻璃卡片上会读成一块实心。 */
  --dsw-specific-selector: transparent;
}
body:not([data-ds-dark-theme]) ${SEAT} [data-composer-card] {
  box-shadow: ${CARD_SHADOW_LIGHT};
}
${P} ${SEAT} [data-composer-card]::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  pointer-events: none;
  background-color: color-mix(in srgb, var(--dsw-specific-input-major) ${GLASS_FILL_ALPHA * 100}%, transparent);
  background-image: ${TOP_GLOW_DARK}, ${BOTTOM_GLOW_DARK}, ${LEFT_GLOW_DARK}, ${RIGHT_GLOW_DARK};
  background-size: 100% 4px, 100% 4px, 4px 100%, 4px 100%;
  background-position: 0 0, 0 100%, 0 0, 100% 0;
  background-repeat: no-repeat;
  box-shadow: ${RIM_DARK};
  backdrop-filter: ${GLASS_BLUR};
}
body:not([data-ds-dark-theme]) ${SEAT} [data-composer-card]::before {
  background-image: ${TOP_GLOW_LIGHT}, ${BOTTOM_GLOW_LIGHT}, ${LEFT_GLOW_LIGHT}, ${RIGHT_GLOW_LIGHT};
  box-shadow: ${RIM_LIGHT};
}
/* 停靠卡补缝：卡与卡/输入框之间的 stack 缝、以及卡片上下圆角后面会透出正文，
   用「底色 + 打光」重绘盖住；只覆盖所需尺寸，不动官方几何。 */
${P} ${SEAT} :is(${DOCK}, ${TODO}) {
  position: relative;
  z-index: 0;
  overflow: visible;
}
/* 顶部：补上方 stack 缝 + 卡片顶部两个圆角缺口（20px 藏进卡片材质之下）。 */
${P} ${SEAT} :is(${DOCK}, ${TODO})::before {
  content: '';
  position: absolute;
  top: calc(-1 * ${STACK_GAP});
  left: calc(-1 * ${SIDE_CLEARANCE});
  right: calc(-1 * ${SIDE_CLEARANCE});
  height: calc(${STACK_GAP} + 20px);
  z-index: -1;
  pointer-events: none;
${GROUND_REPAINT}
}
${P} ${SEAT} :is(${DOCK})::after {
  content: '';
  position: absolute;
  top: calc(100% - 20px);
  left: calc(-1 * ${SIDE_CLEARANCE});
  right: calc(-1 * ${SIDE_CLEARANCE});
  height: calc(${STACK_GAP} + 20px + 24px);
  z-index: -1;
  pointer-events: none;
${GROUND_REPAINT}
}
${P} ${SEAT} ${TODO}::after {
  content: '';
  position: absolute;
  top: 100%;
  left: calc(-1 * ${SIDE_CLEARANCE});
  right: calc(-1 * ${SIDE_CLEARANCE});
  height: calc(${STACK_GAP} + 24px);
  z-index: -1;
  pointer-events: none;
${GROUND_REPAINT}
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
