import { ABOVE_CONTENT_Z_INDEX, PLAIN_ATTR, RIGHT_PANEL_ATTR } from './constants.js'
import { BACKDROP_GRADIENTS } from './backdrop.js'

export const HEADER_HEIGHT_PX = 76
export const HEADER_GLASS_ALPHA = 0.7
export const CARD_GLASS_ALPHA = 0.58
export const SEAT_BAND_PX = 44
const SEAT_BAND_FADE_PX = 10

/** 玻璃边缘的固定高光：方向与旧版一致（光源在左上：上亮、左亮、右暗、底弱）。 */
const RIM_DARK = 'inset 0 1px 2px rgba(255, 255, 255, 0.14), inset 1px 0 2px rgba(255, 255, 255, 0.05), inset -1px 0 2px rgba(0, 0, 0, 0.12), inset 0 -1px 2px rgba(255, 255, 255, 0.09)'
const RIM_LIGHT = 'inset 0 1px 2px rgba(255, 255, 255, 0.55), inset 1px 0 2px rgba(255, 255, 255, 0.35), inset -1px 0 2px rgba(0, 0, 0, 0.06), inset 0 -1px 2px rgba(255, 255, 255, 0.45)'

export function buildGlassCss(): string {
  return `/* header */
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
  background-color: color-mix(in srgb, var(--dsw-alias-bg-base) ${HEADER_GLASS_ALPHA * 100}%, transparent);
  background-image: ${BACKDROP_GRADIENTS};
  background-size: 100vw 100vh;
  background-position: 100% 0;
  background-repeat: no-repeat;
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
/* composer */
body:not([${PLAIN_ATTR}]) :is([data-phase='active'], [data-phase='hero']) [data-composer-seat] {
  background: none !important;
}
body:not([${PLAIN_ATTR}]) :is([data-phase='active'], [data-phase='hero']) [data-composer-seat] [data-composer-card] {
  position: relative;
  z-index: 0;
  background-color: transparent;
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
  background-image: ${BACKDROP_GRADIENTS};
  background-size: 100vw 100vh;
  background-position: 100% 100%;
  background-repeat: no-repeat;
  -webkit-mask-image: linear-gradient(180deg, transparent 0px, black ${SEAT_BAND_FADE_PX}px);
  mask-image: linear-gradient(180deg, transparent 0px, black ${SEAT_BAND_FADE_PX}px);
}
/* right panel: 顶栏玻璃 + 内容区与对话区同款打光 */
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] {
  position: relative;
  isolation: isolate;
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
  background-color: color-mix(in srgb, var(--dsw-alias-bg-base) ${HEADER_GLASS_ALPHA * 100}%, transparent);
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
  background-image: ${BACKDROP_GRADIENTS};
  background-size: 100vw 100vh;
  background-position: 100% -${HEADER_HEIGHT_PX}px;
  background-repeat: no-repeat;
}
`
}
