import {
  ABOVE_CONTENT_Z_INDEX,
  PLAIN_ATTR,
  RIGHT_PANEL_ATTR,
} from './constants.js'
import { BACKDROP_GRADIENTS } from './backdrop.js'

export const HEADER_HEIGHT_PX = 76
/** 顶栏 / 右栏的玻璃填充；不碰官方边框，只做半透明材质。 */
export const GLASS_FILL_ALPHA = 0.4
/** 两处顶栏液态玻璃共用的模糊：冷调提亮，模拟 Liquid Glass 的 regular variant。 */
export const GLASS_BLUR = 'blur(24px) saturate(170%) brightness(1.04)'
/** 输入框单独用低饱和模糊：透明玻璃会直接透出主题底色，过饱和会把底色放大成明显的蓝。 */
export const COMPOSER_BLUR = 'blur(24px) saturate(110%) brightness(1.04)'
/** 输入框中性遮罩比例；越大越不透明、越不显背景色。 */
export const COMPOSER_VEIL_PERCENT = 7

const P = `body:not([${PLAIN_ATTR}])`

/** 右栏顶部两条 38px 带的合成高度（dockkit 条 + 各标签自己的头行）。 */
export const PANEL_BAND_PX = 38
const PANEL_SCROLLER_LIFT_PX = PANEL_BAND_PX * 2

/** 与地面层同源的光：显式视口尺寸 + 定位，禁止 `background-attachment: fixed`。 */
function viewportLight(position: string, size = '100vw 100vh'): string {
  return `  background-image: ${BACKDROP_GRADIENTS};
  background-size: ${size};
  background-position: ${position};
  background-repeat: no-repeat;`
}

/** 顶栏 / 右栏两处液态玻璃共用的材质：只做半透明填充与冷调模糊，不碰官方边框、不加描边 / inset 阴影。 */
function glassMaterial(fill: string, alpha: number): string {
  return `  background-color: color-mix(in srgb, ${fill} ${alpha * 100}%, transparent);
  backdrop-filter: ${GLASS_BLUR};`
}

/** 输入框：很轻的中性遮罩 + 背景模糊 + 固定光源的边缘高光 + 悬浮投影（全部纯 CSS）。 */
function composerMaterial(): string {
  return `  background-color: color-mix(in srgb, var(--dsw-alias-label-primary) ${COMPOSER_VEIL_PERCENT}%, transparent);
  backdrop-filter: ${COMPOSER_BLUR};
  box-shadow:
    0 24px 50px -24px rgba(0, 0, 0, 0.55),
    0 8px 20px -12px rgba(0, 0, 0, 0.30),
    inset 1px 1px 2px rgba(255, 255, 255, 0.24),
    inset 3px 2px 8px -5px rgba(255, 255, 255, 0.22),
    inset -2px 0 8px -6px rgba(255, 255, 255, 0.06),
    inset 0 -2px 8px -6px rgba(255, 255, 255, 0.04);`
}

/**
 * 座位底部「地面重画带」高度：输入框下沿圆角（官方 `--dsw-radius-panel` 28px）距座位底 30px
 * （下方统计胶囊行 26px + 4px 底距），30 + 28 = 58，取 60 留 2px。带顶落在输入框工具行背后，
 * 玻璃下沿不出现一条可辨的分界。
 */
export const SEAT_BAND_PX = 60
/** 官方 composerStack 的堆栈缝（读官方参数，回落当前官方值）。 */
const STACK_GAP = 'var(--dsh-composer-stack-gap, 6px)'
/** 官方输入卡两侧让位（读官方参数，回落当前官方值）。 */
const SIDE_CLEARANCE = 'var(--dsh-composer-side-clearance, 16px)'
/** 停靠卡（todo / goal / queue）的官方锚点；没有类名可依赖，只用语义 data 属性。 */
const DOCK_CARDS = `:is([data-testid='todo-panel'], [data-queue-dock], [data-goal-bar])`
/** 补缝层左右外扩量：这些层与地面逐像素同源，铺到旁边也读作背景本身，大一点更保险。 */
const REPAINT_BLEED = `calc(-1 * (${SIDE_CLEARANCE} + 128px))`

const OBJECT_FIT_LIGHT = viewportLight('0 0', '100% 100%')

/**
 * 「地面原地重画」：与地面层同一张视口渐变。`background-attachment: fixed` 让定位区 = 视口 ⇒
 * 与 `.dsh-theme-tone` 地面层逐像素同源，画在哪都读作背景本身。
 *
 * 这是本表**唯一**允许 `background-attachment: fixed` 的地方：只挂在座位内静态补缝层上
 * （座位 sticky 在视口底部、滚动时自身不动），不是逐消息行；单帧 ≤4 条。若实测有滚动卡顿，
 * 再换运行期相位（显式 `background-size/position` + 量出的视口相位）。
 */
function groundRepaint(): string {
  return `  background-color: var(--dsw-alias-bg-base);
  background-image: ${BACKDROP_GRADIENTS};
  background-attachment: fixed;
  background-repeat: no-repeat;`
}

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
  return `/* ===== 对话区顶栏：浮层化 + 液态玻璃 ===== */
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
${glassMaterial('var(--dsw-alias-bg-base)', GLASS_FILL_ALPHA)}
${viewportLight('100% 0')}
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

/* ===== 输入框：液态玻璃（薄填充 + 背景模糊 + 四边灯光 + 悬浮） =====
   材质放在 ::before（文字之下）：填充与模糊让背景透出来；四边 inset 只做低不透明度
   定向高光，避免大边框；外侧两层软阴影制造悬浮。透镜滤镜只在位移图就绪后叠加。 */
${P} [data-composer-card] {
  position: relative;
  z-index: 0;
  background-color: transparent;
  box-shadow: none;
  --dsw-specific-selector: transparent;
}
${P} [data-composer-card]::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  pointer-events: none;
${composerMaterial()}
}
body:not([${PLAIN_ATTR}]):not([data-ds-dark-theme]) [data-composer-card]::before {
  box-shadow:
    0 24px 50px -24px rgba(31, 35, 60, 0.25),
    0 8px 20px -12px rgba(31, 35, 60, 0.14),
    inset 1px 1px 2px rgba(255, 255, 255, 0.80),
    inset 3px 2px 8px -5px rgba(255, 255, 255, 0.60),
    inset -2px 0 8px -6px rgba(120, 130, 150, 0.10),
    inset 0 -2px 8px -6px rgba(120, 130, 150, 0.08);
}

/* ===== 输入框区漏字补缝：地面原地重画 =====
   座位透明（页面底光真实透出）后，座位里的空白区会漏出滚动的正文。这些区域本来就该是背景，
   所以画一层与地面逐像素同源的「底色 + 打光」——看起来就是背景本身，不改任何官方材质 / 几何：
   ① 输入框下沿：卡片底部圆角缺口 + 下方统计胶囊行（座位底部一条带）；
   ② 停靠卡下方的 stack 缝与卡底圆角缺口：todo / goal / queue 各自补。 */

/* ① 座位底部一条带：带顶落在输入框工具行背后，玻璃下沿不出现可辨分界，带内正文全部盖住。 */
${P} [data-phase='active'] [data-composer-seat]::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: ${SEAT_BAND_PX}px;
  z-index: -1;
  pointer-events: none;
${groundRepaint()}
}

/* ② 停靠卡：卡根不建层叠上下文（不写 z-index）——补缝层用 z-index:-1 落到座位层叠上下文的
   负层，才在卡面材质之下、滚动正文之上。todo 卡根自带 backdrop-filter（本身就是层叠上下文），
   它的补缝只能画在卡面之上，用两个底部圆角遮罩只填缺口。
   - goal / queue：卡根 ::after 从「卡底往上 20px」起，向上藏进卡面圆角、向下盖满 stack 缝。
   - todo：卡根 ::before 用圆角遮罩只填两个底角；::after 盖它下方的 stack 缝。
   - 卡根官方用 overflow:hidden 裁圆角材质，补缝层会被一起裁掉，故放开。 */
${P} [data-phase='active'] [data-composer-seat] ${DOCK_CARDS} {
  position: relative;
  overflow: visible;
}
${P} [data-phase='active'] [data-composer-seat] :is([data-queue-dock], [data-goal-bar])::after {
  content: '';
  position: absolute;
  top: calc(100% - 20px);
  left: ${REPAINT_BLEED};
  right: ${REPAINT_BLEED};
  height: calc(${STACK_GAP} + 20px + 24px);
  z-index: -1;
  pointer-events: none;
${groundRepaint()}
}
${P} [data-phase='active'] [data-composer-seat] [data-testid='todo-panel']::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
${groundRepaint()}
  -webkit-mask-image:
    radial-gradient(circle 16px at 100% 0, transparent 15px, black 16px),
    radial-gradient(circle 16px at 0 0, transparent 15px, black 16px);
  -webkit-mask-size: 16px 16px, 16px 16px;
  -webkit-mask-position: left bottom, right bottom;
  -webkit-mask-repeat: no-repeat, no-repeat;
  mask-image:
    radial-gradient(circle 16px at 100% 0, transparent 15px, black 16px),
    radial-gradient(circle 16px at 0 0, transparent 15px, black 16px);
  mask-size: 16px 16px, 16px 16px;
  mask-position: left bottom, right bottom;
  mask-repeat: no-repeat, no-repeat;
}
${P} [data-phase='active'] [data-composer-seat] [data-testid='todo-panel']::after {
  content: '';
  position: absolute;
  top: 100%;
  left: ${REPAINT_BLEED};
  right: ${REPAINT_BLEED};
  height: calc(${STACK_GAP} + 24px);
  z-index: -1;
  pointer-events: none;
${groundRepaint()}
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
  border-radius: inherit;
${glassMaterial('var(--dsw-alias-bg-base)', GLASS_FILL_ALPHA)}
${viewportLight('100% 0')}
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
