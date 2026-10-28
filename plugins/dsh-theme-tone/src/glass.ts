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

/** 输入框玻璃（第 1 步：材质）：半透明底 + 背景模糊，先保证可读、变高不闪。 */
export const COMPOSER_FILL_ALPHA = 0.55
export const COMPOSER_BLUR = 'blur(12px) saturate(140%)'
/** 输入框圆角（owner 指定 25px；官方 panel 为 28px）。 */
export const COMPOSER_RADIUS_PX = 25
/**
 * 输入框第 2 步：边缘高光。全周 1px 内描边（inset box-shadow 会自动跟圆角走）+ 上下柔光；
 * 不用径向渐变，所以四个角不会出现断光。
 */
export const COMPOSER_RIM_DARK = 'inset 0 1px 0 rgba(255, 255, 255, 0.10), inset 1px 0 0 rgba(255, 255, 255, 0.035), inset -1px 0 0 rgba(255, 255, 255, 0.035), inset 0 -1px 0 rgba(255, 255, 255, 0.035)'
export const COMPOSER_RIM_LIGHT = 'inset 0 1px 0 rgba(255, 255, 255, 0.36), inset 1px 0 0 rgba(255, 255, 255, 0.13), inset -1px 0 0 rgba(255, 255, 255, 0.13), inset 0 -1px 0 rgba(0, 0, 0, 0.04)'
export const COMPOSER_SHEEN_DARK = 'linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.012) 6%, transparent 16%, transparent 84%, rgba(255, 255, 255, 0.025) 94%, rgba(255, 255, 255, 0.03) 100%)'
export const COMPOSER_SHEEN_LIGHT = 'linear-gradient(180deg, rgba(255, 255, 255, 0.19) 0%, transparent 18%, transparent 82%, rgba(255, 255, 255, 0.09) 100%)'
/** 相邻停靠面板之间的 1px 分割线颜色（用 border-top：材质在 ::before 上，inset 阴影会被盖住）。 */
export const DOCK_DIVIDER_DARK = 'rgba(255, 255, 255, 0.08)'
export const DOCK_DIVIDER_LIGHT = 'rgba(0, 0, 0, 0.07)'

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

/* ===== 输入框玻璃 · 第 1+2 步：材质 + 边缘高光 =====
   材质：座位透明、卡片半透明底（跟官方圆角 / 动态高度）、::before 只做 backdrop-filter。
   高光：全周 1px 内描边 + 上下柔光（inset box-shadow / 线性渐变，自动跟圆角），不画径向断光，
   也还没有折射（留到第 3 步单独做）。 */
${P} ${SEAT} {
  background: none !important;
}
${P} ${SEAT} [data-composer-card] {
  position: relative;
  z-index: 0;
  background-color: color-mix(in srgb, var(--dsw-specific-input-major) ${COMPOSER_FILL_ALPHA * 100}%, transparent);
  /* 圆角按 owner 指定收到 25px（官方 panel 28px），::before 继承。 */
  border-radius: ${COMPOSER_RADIUS_PX}px;
  /* 「+」等 selector 型按钮：官方给的是不透明中性底，在玻璃上会读成一块实心，跟着玻璃让出底色。 */
  --dsw-specific-selector: transparent;
}
${P} ${SEAT} [data-composer-card]::before {
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
body:not([data-ds-dark-theme]) ${SEAT} [data-composer-card]::before {
  background-image: ${COMPOSER_SHEEN_LIGHT};
  box-shadow: ${COMPOSER_RIM_LIGHT};
}
/* 座位撤掉官方 36px 实色渐隐后，卡片下方的统计胶囊行没有遮罩；给 dock 行本身垫「地面同源」
   的底色 + 打光。宽度必须与输入框一致（官方 dock 是 flex 子项，宽 auto 只有胶囊宽度，两侧必漏），
   所以显式 width:100% + 卡片同款 max-width；向下多垫 4px 座位内边距，不向上进入卡片。
   fixed 背景定位区 = 视口，与地面层逐像素同源；这里面积只有胶囊一行，是唯一允许的 fixed 例外。 */
${P} [data-phase='active'] [data-composer-seat] [data-composer-dock] {
  width: 100%;
  max-width: var(--dsh-composer-card-max-width);
  margin-bottom: -4px;
  padding: 4px 0;
  background-color: var(--dsw-alias-bg-base);
  background-image: ${BACKDROP_GRADIENTS};
  background-attachment: fixed;
}

/* ===== 停靠区（todo / goal / queue）统一规格 =====
   三者用同一套：不透明浮层底、默认上圆下直、负边距刚好抵消 stack 缝；
   叠多个时非最上面的面板顶角切直角，并在顶部画 1px 分割线（border-top，材质在 ::before
   上，inset 阴影会被盖住；1px 边框不改变可视对齐）。
   只保留各自的图标 / 标题专属色。 */
${P} [data-phase='active'] [data-composer-seat] :is([data-queue-dock] > *, [data-goal-bar] > div, [data-testid='todo-panel']) {
  border-radius: var(--dsw-radius-lg) var(--dsw-radius-lg) 0 0;
  /* 底色也铺在元素本身：分割线是半透明 border-top，border 区若没有不透明底会透出滚动的正文。 */
  background-color: var(--dsw-alias-bg-layer-2);
  box-shadow: none;
  --dsw-elevation-stroke-color: transparent;
}
${P} [data-phase='active'] [data-composer-seat] :is([data-goal-bar], [data-queue-dock]):not(:first-child) > *,
${P} [data-phase='active'] [data-composer-seat] [data-testid='todo-panel']:not(:first-child) {
  border-radius: 0;
  border-top: 1px solid ${DOCK_DIVIDER_DARK};
}
${P} [data-phase='active'] [data-composer-seat] :is([data-testid='todo-panel'], [data-goal-bar], [data-queue-dock]) {
  margin-bottom: calc(0px - var(--dsh-composer-stack-gap));
}
body:not([${PLAIN_ATTR}]):not([data-ds-dark-theme]) [data-phase='active'] [data-composer-seat] :is([data-goal-bar], [data-queue-dock]):not(:first-child) > *,
body:not([${PLAIN_ATTR}]):not([data-ds-dark-theme]) [data-phase='active'] [data-composer-seat] [data-testid='todo-panel']:not(:first-child) {
  border-top-color: ${DOCK_DIVIDER_LIGHT};
}
/* queue 官方在 panel::after 上画 0.5px 描边；停靠区统一后去掉，避免消息列表看起来有边框。 */
${P} [data-phase='active'] [data-queue-dock] > *::after {
  border: 0;
}
/* 不透明材质：todo 根节点 / queue 的 panel::before / goal 的 bar::before。 */
${P} [data-phase='active'] [data-testid='todo-panel'] {
  background: var(--dsw-alias-bg-layer-2);
  backdrop-filter: none;
}
${P} [data-phase='active'] [data-queue-dock] > *::before,
${P} [data-phase='active'] [data-goal-bar] > div::before {
  background: var(--dsw-alias-bg-layer-2);
  backdrop-filter: none;
}
/* 专属色：只涂图标 + 标题，正文与右侧按钮保持官方色。 */
${P} [data-phase='active'] [data-testid='todo-panel'] > div > button > span:first-child,
${P} [data-phase='active'] [data-testid='todo-panel'] > div > button > span:nth-child(2) {
  color: var(--dsw-alias-state-success-primary);
}
${P} [data-phase='active'] [data-goal-bar] > div > span:first-child,
${P} [data-phase='active'] [data-goal-bar] > div > span:nth-child(2) {
  color: var(--dsw-alias-state-warn-primary);
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
