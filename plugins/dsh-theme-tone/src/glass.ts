import { ABOVE_CONTENT_Z_INDEX, PLAIN_ATTR, RIGHT_PANEL_ATTR } from './constants.js'
import { BACKDROP_GRADIENTS } from './backdrop.js'

export const HEADER_HEIGHT_PX = 76
export const HEADER_GLASS_ALPHA = 0.7
export const CARD_GLASS_ALPHA = 0.58
export const SEAT_BAND_PX = 44
const SEAT_BAND_FADE_PX = 10

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
  backdrop-filter: var(--dsw-menu-backdrop-filter);
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
/* right panel header */
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] {
  position: relative;
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
`
}
