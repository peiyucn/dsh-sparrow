import {
  ABOVE_CONTENT_Z_INDEX,
  PLAIN_ATTR,
  RIGHT_PANEL_ATTR,
} from './constants.js'
import { BACKDROP_GRADIENTS, DITHER_SIZE, DITHER_TILE } from './backdrop.js'

export const HEADER_HEIGHT_PX = 76
/** 输入框的背景模糊：低饱和、略提亮，保留磨砂感又不把背后的正文糊成色块。 */
export const COMPOSER_BLUR = 'blur(16px) saturate(105%) brightness(1.14)'
/** 顶栏 / 右栏两条带的背景模糊（沿用调整前的冷调提亮配方）。 */
export const GLASS_BLUR = 'blur(24px) saturate(170%) brightness(1.04)'
/** 顶栏填充浓度：调整前是 40%，压亮度后为 54%（不压到输入框的 62%，金色光仍保留）。 */
export const BAR_FILL_ALPHA = 0.54
/** 顶栏金光叠加强度：相对地面层光 alpha 的百分比（85% 实测金光可见且与左栏同色）。 */
export const BAR_GOLD_PERCENT = 85
/** 输入框遮罩比例；越大越不透明、越不显背景色。 */
export const COMPOSER_VEIL_PERCENT = 62
/** 暗色玻璃的「抬亮」比例：底色里掺入抬升面（bg-layer-3）的颜色，避免整块死黑；0 = 纯黑。 */
export const COMPOSER_LIFT_PERCENT = 40
/** 浅色轴的遮罩用接近底色的乳白：`label-primary` 在浅色轴是深色，叠出来会发灰。 */
export const COMPOSER_VEIL_PERCENT_LIGHT = 60
/** 输入框边缘光：中段亮芯（px 半径）——「光打在玻璃上」的那点亮，不是描边。 */
export const COMPOSER_CORE_WIDTH_PX = 1.5
/** 输入框边缘光：软晕的纵向半径（px）；贴着边收住，不往卡面里铺开。 */
export const COMPOSER_BLOOM_WIDTH_PX = 5
/** 亮芯 / 软晕的 alpha（中段）；上下同款、左右同款。 */
export const COMPOSER_CORE_ALPHA = 0.08
export const COMPOSER_CORE_ALPHA_LIGHT = 0.05

const P = `body:not([${PLAIN_ATTR}])`

/** 右栏顶部两条 38px 带的合成高度（dockkit 条 + 各标签自己的头行）。 */
export const PANEL_BAND_PX = 38

/** 与地面层同源的光：显式视口尺寸 + 定位，禁止 `background-attachment: fixed`。 */
function viewportLight(position: string, size = '100vw 100vh'): string {
  return `  background-image: ${BACKDROP_GRADIENTS};
  background-size: ${size};
  background-position: ${position};
  background-repeat: no-repeat;`
}

/**
 * 暗色玻璃材质：底色 + 抬升面按比例混成深色膜，再按遮罩浓度半透明铺开，配低饱和模糊。
 * 输入框、对话顶栏、右栏两条带共用同一套填充与遮罩。
 */
function darkGlassFilm(): string {
  return `  background-color: color-mix(in srgb,
    color-mix(in srgb, var(--dsw-alias-bg-base) ${100 - COMPOSER_LIFT_PERCENT}%, var(--dsw-alias-bg-layer-3) ${COMPOSER_LIFT_PERCENT}%) ${COMPOSER_VEIL_PERCENT}%,
    transparent);
  backdrop-filter: ${COMPOSER_BLUR};`
}

/**
 * 顶栏 / 右栏两条带的材质：调整前的冷调模糊 + 与地面层同相位的金色光（{@link BAR_GOLD_PERCENT}）。
 * 金光按视口坐标（fixed）叠加，与左栏顶部取的是同一片光；只叠顶部 / 左侧两段，底部那段顶栏用不到。
 * 双份全强度光会发红，所以按百分比收敛。
 */
function barGlass(): string {
  const top = `color-mix(in srgb, var(--dsh-theme-tone-top, transparent) ${BAR_GOLD_PERCENT}%, transparent)`
  const left = `color-mix(in srgb, var(--dsh-theme-tone-left, transparent) ${BAR_GOLD_PERCENT}%, transparent)`
  return `  background-color: color-mix(in srgb, var(--dsw-alias-bg-base) ${BAR_FILL_ALPHA * 100}%, transparent);
  backdrop-filter: ${GLASS_BLUR};
  /* 与 .dsh-theme-tone 地面层同相位（fixed = 视口坐标）：取同一片光，颜色才和左栏顶部一致。
     只叠顶部 / 左侧两段（顶栏在视口顶部，底部那段用不到）。 */
  background-image:
    radial-gradient(ellipse 80vw 45vh at 50% -10vh, ${top}, transparent var(--dsh-theme-tone-top-stop, 62%)),
    radial-gradient(ellipse 38vw 58vh at 0% -6vh, ${left}, transparent 68%);
  background-size: 100vw 100vh, 100vw 100vh;
  background-position: 0 0, 0 0;
  background-repeat: no-repeat, no-repeat;
  background-attachment: fixed, fixed;`
}

/**
 * 输入框四条边的光：**贴边的亮芯 + 短软晕**，两端自然淡出；上 / 下同款、左 / 右同款。
 * 光贴着边收住（晕开半径小、多段缓出），不往卡面里铺 ⇒ 读作光打在玻璃边上，不是描边也不糊面。
 */
function composerEdgeLight(coreAlpha: number): string {
  const a = coreAlpha
  const stops = `rgba(255, 255, 255, ${a}) 0%, rgba(255, 255, 255, ${a * 0.4}) 34%, rgba(255, 255, 255, ${a * 0.1}) 70%, rgba(255, 255, 255, 0) 100%`
  const c = COMPOSER_CORE_WIDTH_PX
  const b = COMPOSER_BLOOM_WIDTH_PX
  return `radial-gradient(ellipse 52% ${b}px at 50% 0, ${stops}),
    radial-gradient(ellipse 52% ${b}px at 50% 100%, ${stops}),
    radial-gradient(ellipse ${b}px 52% at 0 50%, ${stops}),
    radial-gradient(ellipse ${b}px 52% at 100% 50%, ${stops}),
    radial-gradient(ellipse 26% ${c}px at 50% 0, rgba(255, 255, 255, ${a * 0.9}), transparent 100%),
    radial-gradient(ellipse 26% ${c}px at 50% 100%, rgba(255, 255, 255, ${a * 0.9}), transparent 100%),
    radial-gradient(ellipse ${c}px 26% at 0 50%, rgba(255, 255, 255, ${a * 0.9}), transparent 100%),
    radial-gradient(ellipse ${c}px 26% at 100% 50%, rgba(255, 255, 255, ${a * 0.9}), transparent 100%)`
}

/**
 * 定向玻璃边光（commit 版配方，适配黑玻璃）：光从左上来、往右下衰减到几乎为零。
 * 四边都有光但强度一路递减，因此玻璃形状被读出来，却没有任何一段是均匀等亮的 ⇒ 不会成描边。
 */
function composerEdgeWash(alpha: number): string {
  return `inset 1px 1px 2px rgba(255, 255, 255, ${alpha}),
    inset 3px 2px 9px -5px rgba(255, 255, 255, ${alpha * 0.9}),
    inset -2px 0 9px -6px rgba(255, 255, 255, ${alpha * 0.28}),
    inset 0 -2px 9px -6px rgba(255, 255, 255, ${alpha * 0.18})`
}

/** 输入框：暗色玻璃材质 + 对称边缘光 + 悬浮投影（纯 CSS）。 */
function composerMaterial(): string {
  return `${darkGlassFilm()}
  background-image: ${composerEdgeLight(COMPOSER_CORE_ALPHA)};
  background-repeat: no-repeat;
  /* 悬浮投影的向下偏移 / 扩散收小：输入框贴着窗口底部，旧参数（28px 偏移 + 60px 模糊）会在
     窗口最底部压出一条可辨的深色长方条；阴影只保留"浮起"所需的最小量。 */
  box-shadow:
    0 16px 36px -24px rgba(0, 0, 0, 0.55),
    0 8px 20px -12px rgba(0, 0, 0, 0.38),
    0 2px 8px -4px rgba(0, 0, 0, 0.26),
    0 1px 2px rgba(0, 0, 0, 0.30),
    ${composerEdgeWash(0.08)};`
}

/**
 * 座位底部「地面重画带」高度：原先取 60（输入框下沿圆角 28 + 距座位底 30 = 58，再留 2px）。
 * 现在收窄到 48：带顶落在输入框工具行背后仍能盖住漏出的正文，又不会遮住输入框底部的悬浮阴影。
 */
export const SEAT_BAND_PX = 48
/** 官方 composerStack 的堆栈缝（读官方参数，回落当前官方值）。 */
const STACK_GAP = 'var(--dsh-composer-stack-gap, 6px)'
/** 停靠卡（todo / goal / queue）的官方锚点；没有类名可依赖，只用语义 data 属性。 */
const DOCK_CARDS = `:is([data-testid='todo-panel'], [data-queue-dock], [data-goal-bar])`

const OBJECT_FIT_LIGHT = viewportLight('0 0', '100% 100%')

/**
 * 停靠卡缝隙 / 圆角缺口 / 座位底部的「地面原地重画」：与地面层同一张视口渐变（含 1 LSB 抖动层）。
 * `background-attachment: fixed` 让背景定位区 = 视口 ⇒ 与 `.dsh-theme-tone` 地面层逐像素同源，
 * 右栏开合导致正文列变窄时也不会出现横向相位差（那会在窗口底部显出颜色略异的长方条）。
 * 该写法只挂在座位内的静态补缝层上（座位 sticky 在视口底部、滚动时自身不动），不是逐消息行。
 */
function groundRepaint(): string {
  return `  background-color: var(--dsw-alias-bg-base);
  background-image: ${BACKDROP_GRADIENTS}, ${DITHER_TILE};
  background-size: auto, auto, auto, ${DITHER_SIZE};
  background-attachment: fixed;
  background-repeat: no-repeat, no-repeat, no-repeat, repeat;`
}

const RP = `[${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane]`
/** 右栏顶栏总高（dockkit 条 + 标签自己的头行），两条 38px 带。 */
const PANEL_HEAD_PX = PANEL_BAND_PX * 2
/** 右栏 76px 下有「可流式滚动的正文」的标签：只有它们上提滚区，正文才会真的从两条带下滚过。 */
const LIFTED_SCROLLS = [
  `${P} ${RP} [data-textpreview-state='text'][data-document-preview$='/markdown'] [data-textpreview-body]`,
  `${P} ${RP} [data-textpreview-state='text'][data-document-preview$='/text'] [data-textpreview-body]`,
  `${P} ${RP} [data-files-state='tree'] [data-files-body]`,
].join(',\n')
/** 滚动条轨道规则要把伪元素加在**每条选择器**上（整串逗号列表末尾追加只会命中最后一条）。 */
const LIFTED_TRACKS = LIFTED_SCROLLS.split(',\n').map(selector => `${selector}::-webkit-scrollbar-track`).join(',\n')

/** 各标签自己的 38px 头行（玻璃面挂在它们的 ::before 上，向上铺满 0..76）。 */
const PANEL_HEADERS = [
  `${P} ${RP} [data-files-state='tree'] > *:first-child`,
  `${P} ${RP} [data-textpreview-state='unsupported'] > *:first-child`,
  `${P} ${RP} [data-textpreview-state='text'] > *:first-child:not([data-textpreview-changed]):not([data-textpreview-meta-failed])`,
  `${P} ${RP} [data-textpreview-state='text'] > [data-textpreview-changed] + *`,
  `${P} ${RP} [data-textpreview-state='text'] > [data-textpreview-meta-failed] + *`,
].join(',\n')

export function buildGlassCss(): string {
  return `/* ===== 对话区顶栏：浮层化 + 顶栏玻璃（材质见 surface 表 / barGlass） ===== */
${P} [data-phase='active'] { position: relative; }
${P} [data-phase='active'] [data-slot='conversation.header'] > header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: ${ABOVE_CONTENT_Z_INDEX};
}
/* 顶栏材质 = 54% 底色 + 冷调模糊 + 85% 强度的同相位金光；边缘光 / 悬浮阴影是输入框
   作为「浮起卡片」的专属细节，顶栏不加。 */
${P} [data-phase='active'] [data-slot='conversation.header'] > header::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  border-radius: inherit;
${barGlass()}
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

/* ===== 输入框：暗色磨砂玻璃（薄填充 + 背景模糊 + 边缘光 + 悬浮） =====
   材质放在 ::before（文字之下）：填充与模糊让背景透出来；边缘光只做低不透明度、
   中段最亮两端淡出的软光，避免读成描边；外侧多层软阴影制造悬浮。 */
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
/* 浅色轴：乳白遮罩 + 更淡的边缘光与阴影（暗色膜在浅色轴上会显脏）。 */
body:not([${PLAIN_ATTR}]):not([data-ds-dark-theme]) [data-composer-card]::before {
  background-color: color-mix(in srgb, var(--dsw-alias-bg-base) ${COMPOSER_VEIL_PERCENT_LIGHT}%, transparent);
  background-image: ${composerEdgeLight(COMPOSER_CORE_ALPHA_LIGHT)};
  box-shadow:
    0 16px 36px -24px rgba(31, 35, 60, 0.24),
    0 8px 20px -12px rgba(31, 35, 60, 0.16),
    0 2px 8px -4px rgba(31, 35, 60, 0.10),
    0 1px 2px rgba(31, 35, 60, 0.10),
    ${composerEdgeWash(0.12)};
}

/* ===== 输入框区漏字补缝：地面原地重画 =====
   座位透明（页面底光真实透出）后，座位里的空白区会漏出滚动的正文。这些区域本来就该是背景，
   所以画一层与地面逐像素同源的「底色 + 打光」——看起来就是背景本身，不改任何官方材质 / 几何：
   ① 输入框下沿：卡片底部圆角缺口 + 下方统计胶囊行（座位底部一条带）；
   ② 停靠卡下方的 stack 缝与卡底圆角缺口：todo / goal / queue 各自补。 */

/* ① 座位底部一条带：带顶落在输入框工具行背后，玻璃下沿不出现可辨分界，带内正文全部盖住。
   这条与地面层**逐像素同源**：background-attachment: fixed 让背景定位区 = 视口，三张渐变
   与地面层（.dsh-theme-tone 也是视口坐标）完全同相位；若按元素自身右边对齐（旧写法），
   右栏打开、正文列变窄时横向相位会偏，窗口底部会看出一条颜色略不同的长方条。 */
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

/* ② 停靠卡（todo / goal / queue）：材质在 surfaces 表里统一改成不透明抬升面（见 buildSurfaceCss），
   这里只负责补缝。卡根不建层叠上下文：补缝层用 z-index:-1 落到座位层叠上下文的负层，才在卡面材质
   之下、滚动正文之上 —— 圆角缺口由补缝层从卡面**底下**补齐，不会像遮罩那样把圆角压出缺口。
   补缝层宽度 = 卡根宽度（等于或大于正文列宽），不再向两侧外扩，避免撑出水平滚动条；
   卡根官方用 overflow:hidden 裁圆角材质，补缝层会被一起裁掉，故放开。 */
${P} [data-phase='active'] [data-composer-seat] ${DOCK_CARDS} {
  position: relative;
  overflow: visible;
}
${P} [data-phase='active'] [data-composer-seat] ${DOCK_CARDS}::after {
  content: '';
  position: absolute;
  top: calc(100% - 20px);
  left: 0;
  right: 0;
  height: calc(${STACK_GAP} + 20px + 24px);
  z-index: -1;
  pointer-events: none;
${groundRepaint()}
}

/* ===== 右边栏：底色 + 打光（玻璃面不挂 pane 本体，避免采样到自己的子内容） ===== */
${P} ${RP} {
  background-color: var(--dsw-alias-bg-base);
${viewportLight('100% 0')}
}

/* 与主对话区一致：正文从顶栏下滚（顶栏玻璃才有内容可糊），滚动条从顶栏下沿开始。
   做法：把可流式滚动的正文上提「顶栏总高」，内容再下移同样的量（只改视觉位置），顶栏在流内占的
   高度用负底距还回去，滚动条轨道再让回「顶栏总高 + 2px」。
   顺序很重要：轨道规则放在「上提」之前 —— Chromium 里轨道伪元素的 margin 会参与元素自身 margin
   的竞争，轨道规则带 !important（必须压过官方的 .body 模块规则），靠后用 html 提特异性让上提仍然赢。 */
${LIFTED_TRACKS} {
  margin-block-start: ${PANEL_HEAD_PX + 2}px !important;
}
html ${LIFTED_SCROLLS} {
  margin-top: -${PANEL_HEAD_PX}px !important;
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
  transform: translateY(${PANEL_HEAD_PX}px);
}
${P} ${RP} > *:first-child {
  margin-bottom: -${PANEL_BAND_PX}px;
}
${P} ${RP} > *:last-child > [data-sidebar-right-tab] {
  padding-top: ${PANEL_BAND_PX}px;
  box-sizing: border-box;
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
${barGlass()}
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
