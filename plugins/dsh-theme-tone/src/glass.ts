import { ABOVE_CONTENT_Z_INDEX, PLAIN_ATTR, RIGHT_PANEL_ATTR } from './constants.js'
import { BACKDROP_GRADIENTS } from './backdrop.js'

export const HEADER_HEIGHT_PX = 76
export const HEADER_GLASS_ALPHA = 0.7
export const CARD_GLASS_ALPHA = 0.58
export const CARD_MENU_OPEN_ALPHA = 0.9
export const SEAT_BAND_PX = 44

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

export function buildGlassCss(): string {
  return `/* ===== 对话区顶栏：浮层化 + 玻璃 ===== */
body:not([${PLAIN_ATTR}]) [data-phase='active'] { position: relative; }
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-slot='conversation.header'] > header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: ${ABOVE_CONTENT_Z_INDEX};
}
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-slot='conversation.header'] > header::before {
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
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-conversation-scroll] {
  padding-top: ${HEADER_HEIGHT_PX}px;
}
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-conversation-scroll]::-webkit-scrollbar-track {
  margin: calc(${HEADER_HEIGHT_PX}px + 2px) 2px 2px;
}
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-width-handle] {
  top: ${HEADER_HEIGHT_PX}px;
}

/* ===== 输入框：卡片玻璃 + 座位底带 ===== */
body:not([${PLAIN_ATTR}]) :is([data-phase='active'], [data-phase='hero']) [data-composer-seat] {
  background: none !important;
}
body:not([${PLAIN_ATTR}]) :is([data-phase='active'], [data-phase='hero']) [data-composer-seat] [data-composer-card] {
  position: relative;
  z-index: 0;
  background-color: transparent;
  /* 卡片里的「+」等 selector 型图标按钮：官方给的是不透明的中性底色，在玻璃卡片上会读成一块实心；
     卡片作用域内把这枚 token 放透明，按钮只剩图标（hover 仍走官方的 interactive-bg-hover）。 */
  --dsw-specific-selector: transparent;
}
body:not([${PLAIN_ATTR}]) :is([data-phase='active'], [data-phase='hero']) [data-composer-seat] [data-composer-card]::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  pointer-events: none;
  background-color: color-mix(in srgb, var(--dsw-specific-input-major) ${CARD_GLASS_ALPHA * 100}%, transparent);
  box-shadow: ${RIM_DARK};
  backdrop-filter: var(--dsw-menu-backdrop-filter);
}
body:not([data-ds-dark-theme]) :is([data-phase='active'], [data-phase='hero']) [data-composer-seat] [data-composer-card]::before {
  box-shadow: ${RIM_LIGHT};
}
/* 座位底带：卡片下方滚过的正文用「地面同源」的一小段盖住；带顶被卡片盖住，不需要 mask（少一层合成）。 */
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-composer-seat]::after {
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

/* ===== 右边栏：顶栏玻璃（背面是对话区，真模糊）+ 内容区同款打光 =====
   pane 用 z-index: 0 自成层叠上下文（约束 ::before 的 z-index:-1），**不能**用 isolation：
   isolation 会让 pane 成为 backdrop root，顶栏玻璃就只采样到 pane 内部（空的）⇒ 只剩一层实色。 */
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] {
  position: relative;
  z-index: 0;
  background: linear-gradient(180deg, transparent 0px, transparent ${HEADER_HEIGHT_PX}px, var(--dsw-alias-bg-base) ${HEADER_HEIGHT_PX}px);
}
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane]::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: ${HEADER_HEIGHT_PX}px;
  z-index: -1;
  pointer-events: none;
${glassFill(HEADER_GLASS_ALPHA)}
${viewportLight('100% 0')}
  backdrop-filter: var(--dsw-menu-backdrop-filter);
}
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane]::after {
  content: '';
  position: absolute;
  top: ${HEADER_HEIGHT_PX}px;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: -2;
  pointer-events: none;
  background-color: var(--dsw-alias-bg-base);
${viewportLight(`100% -${HEADER_HEIGHT_PX}px`)}
}

/* ===== 设置弹窗：打光（按弹窗自身盒子缩放，窗口在视口中间，不按视口相位画） ===== */
body:not([${PLAIN_ATTR}]) [data-shortcut-modal='settings'] {
${OBJECT_FIT_LIGHT}
}

/* ===== 菜单打开时：撤掉常驻 blur，避免「blur 采样 blur」的合成快照残影 =====
   官方 MenuSurface 自己带 backdrop-filter；与输入框 / 顶栏 / 右栏的常驻 blur 重叠时，Chromium 会短时
   复用错位的背景快照（owner 截图：模型菜单打开后输入框上沿闪出菜单碎片，频率跟随工具输出）。菜单是
   body 直接子元素，has(> …) 的失效跟踪只落在 body 的子节点列表上，开销可忽略。撤 blur 的同时把卡片
   填充提高到接近不透明，避免下面正文突然变清晰。 */
body:not([${PLAIN_ATTR}]):has(> [data-menu-material]) :is([data-phase='active'], [data-phase='hero']) [data-composer-seat] [data-composer-card]::before,
body:not([${PLAIN_ATTR}]):has(> [data-menu-material]) [data-phase='active'] [data-slot='conversation.header'] > header::before,
body:not([${PLAIN_ATTR}]):has(> [data-menu-material]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane]::before {
  backdrop-filter: none;
}
body:not([${PLAIN_ATTR}]):has(> [data-menu-material]) :is([data-phase='active'], [data-phase='hero']) [data-composer-seat] [data-composer-card]::before {
  background-color: color-mix(in srgb, var(--dsw-specific-input-major) ${CARD_MENU_OPEN_ALPHA * 100}%, transparent);
}
`
}
