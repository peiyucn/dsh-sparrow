/**
 * 办公桌页样式表（纯 CSS 文本，由 client half 注入）：页头、标签栏、便签墙、贴纸与「+」按钮。
 * 拆成独立模块：node:test 可脱离 React 组件直接验证注入 / 复用 / 移除。
 */

import { STYLE_SELECTOR } from '../constants.js'

const DESK_CSS = `
/* 主面板页面：官方入口型页面同款（标题行自带 28px 顶内边距，macOS 下让出窗口顶带）。
   ⚠️ 中央列不提供基准字号，页面根必须显式给 14px。
   便签墙要占满剩余高度：页面自身不滚动，滚动交给墙面。 */
.dsh-desk-page {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: 0 clamp(20px, 3vw, 40px) 0;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 14px;
}
.dsh-desk-page > * {
  width: 100%;
  max-width: 960px;
  margin-left: auto;
  margin-right: auto;
}
.dsh-desk-head {
  box-sizing: border-box;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-top: 28px;
  margin-bottom: 8px;
  flex: none;
}
html[data-platform='darwin'] .dsh-desk-head {
  padding-top: calc(28px + var(--dsh-frame-top-clearance, 0px));
}
.dsh-desk-title {
  margin: 0;
  font-size: 20px;
  font-weight: 500;
  line-height: 28px;
}
.dsh-desk-subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
/* 标签栏：总览 / 便签墙 /（后续：任务板 / 日程 / 专注）。 */
.dsh-desk-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  margin-bottom: 12px;
  flex: none;
}
.dsh-desk-tab {
  appearance: none;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  padding: 8px 12px;
  font-size: 14px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  cursor: pointer;
}
.dsh-desk-tab:hover {
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsh-desk-tab[data-active='true'] {
  color: var(--dsw-alias-label-primary, #1f2329);
  border-bottom-color: var(--dsw-alias-label-primary, #1f2329);
  font-weight: 500;
}
/* 墙面：正好占满剩余高度、**不滚动**；贴纸坐标一律夹在可见区域内。 */
.dsh-desk-wall {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  margin-bottom: 40px;
}
.dsh-desk-wall-hint {
  position: absolute;
  left: 50%;
  top: 38%;
  transform: translate(-50%, -50%);
  margin: 0;
  padding: 0 16px;
  text-align: center;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  pointer-events: none;
}
/* 贴纸：便签墙的基本单位。真实便签是方角纸片，不做大圆角、不做渐变。
   配色参考 Notion 浅色模式的背景色板（低饱和、偏暖中性），文字用 Notion 墨色 #37352F。 */
.dsh-desk-note {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 8px 12px 12px;
  border: 1px solid rgba(55, 53, 47, 0.08);
  border-radius: 2px;
  background-color: #f4f1ea;
  color: #37352f;
  box-shadow: 0 1px 1px rgba(24, 28, 40, 0.05), 0 6px 16px -10px rgba(24, 28, 40, 0.28);
  cursor: grab;
  user-select: none;
  touch-action: none;
  transition: box-shadow 0.14s ease;
}
.dsh-desk-note:hover {
  box-shadow: 0 2px 4px rgba(24, 28, 40, 0.07), 0 14px 26px -16px rgba(24, 28, 40, 0.4);
}
.dsh-desk-note:active {
  cursor: grabbing;
}
/* Notion 浅色模式背景色板（微调偏暖后用于纸面）。 */
.dsh-desk-note[data-color='default'] { background-color: #f4f1ea; }
.dsh-desk-note[data-color='yellow'] { background-color: #faf3dd; }
.dsh-desk-note[data-color='green'] { background-color: #eef3ed; }
.dsh-desk-note[data-color='blue'] { background-color: #e9f3f7; }
.dsh-desk-note[data-color='pink'] { background-color: #f9f2f5; }
.dsh-desk-note-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 20px;
  margin-bottom: 4px;
}
/* 拖动提示：紧凑的六点抓握纹（2 列 × 3 行、2px 点、2px 间距），低对比度常驻、悬停略清楚。
   不用文字、不用背景块；整个正文以外的区域都能拖，它只是「这里能抓」的提示。 */
.dsh-desk-note-grip {
  flex: none;
  display: grid;
  grid-template-columns: repeat(2, 2px);
  grid-template-rows: repeat(3, 2px);
  gap: 2px;
  color: rgba(55, 53, 47, 0.26);
  cursor: grab;
  transition: color 0.12s ease;
}
.dsh-desk-note-grip i {
  display: block;
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: currentColor;
}
.dsh-desk-note:hover .dsh-desk-note-grip {
  color: rgba(55, 53, 47, 0.5);
}
.dsh-desk-note:active .dsh-desk-note-grip {
  cursor: grabbing;
}
.dsh-desk-note-colors {
  display: flex;
  gap: 5px;
  margin-left: auto;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.dsh-desk-note:hover .dsh-desk-note-colors,
.dsh-desk-note:focus-within .dsh-desk-note-colors {
  opacity: 1;
}
/* 色板：圆点与便签纸面**同色**（不靠加深颜色制造可见性，用细环区分），选中态再加一圈墨色细环。 */
.dsh-desk-dot {
  appearance: none;
  width: 12px;
  height: 12px;
  padding: 0;
  border: 1px solid rgba(55, 53, 47, 0.2);
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.dsh-desk-dot:hover {
  transform: scale(1.12);
}
.dsh-desk-dot[data-color='default'] { background: #f4f1ea; }
.dsh-desk-dot[data-color='yellow'] { background: #faf3dd; }
.dsh-desk-dot[data-color='green'] { background: #eef3ed; }
.dsh-desk-dot[data-color='blue'] { background: #e9f3f7; }
.dsh-desk-dot[data-color='pink'] { background: #f9f2f5; }
.dsh-desk-dot[data-active='true'] {
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.9), 0 0 0 3px rgba(55, 53, 47, 0.55);
}
.dsh-desk-note-close {
  appearance: none;
  border: none;
  background: transparent;
  padding: 0 2px;
  font-size: 16px;
  line-height: 1;
  color: rgba(43, 41, 38, 0.4);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease, color 0.12s ease;
}
.dsh-desk-note:hover .dsh-desk-note-close,
.dsh-desk-note:focus-within .dsh-desk-note-close {
  opacity: 1;
}
.dsh-desk-note-close:hover {
  color: #a33b35;
}
.dsh-desk-note-body {
  box-sizing: border-box;
  flex: 1;
  width: 100%;
  min-height: 0;
  padding: 0;
  border: none;
  outline: none;
  resize: none;
  overflow: auto;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
  line-height: 21px;
  cursor: text;
}
.dsh-desk-note-body::placeholder {
  color: rgba(55, 53, 47, 0.3);
}
/* 右下角改大小：一条极简的角标（右边 + 下边各一像素），悬停才出现，不做斜线花纹。 */
.dsh-desk-note-resize {
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 8px;
  height: 8px;
  border-right: 1.5px solid rgba(55, 53, 47, 0.32);
  border-bottom: 1.5px solid rgba(55, 53, 47, 0.32);
  border-bottom-right-radius: 1px;
  cursor: nwse-resize;
  opacity: 0;
  transition: opacity 0.12s ease, border-color 0.12s ease;
  touch-action: none;
}
.dsh-desk-note:hover .dsh-desk-note-resize,
.dsh-desk-note:focus-within .dsh-desk-note-resize {
  opacity: 1;
}
.dsh-desk-note-resize:hover {
  border-color: rgba(55, 53, 47, 0.6);
}
/* 「+」：悬浮在右下角，页面级固定（不随墙面滚动）。 */
.dsh-desk-add {
  position: absolute;
  right: 28px;
  bottom: 28px;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--dsw-alias-label-primary, #1f2329);
  color: var(--dsw-alias-bg-layer-1, #ffffff);
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 8px 20px rgba(20, 25, 40, 0.28);
  transition: transform 0.12s ease;
}
.dsh-desk-add:hover {
  transform: translateY(-1px);
}
.dsh-desk-add:disabled {
  opacity: 0.6;
  cursor: default;
}
.dsh-desk-today {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.dsh-desk-stats {
  margin: 0;
  font-size: 14px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
/* 总览页：最近便签列表。 */
.dsh-desk-section-title {
  margin: 8px 0 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-desk-recent {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.dsh-desk-recent-item {
  appearance: none;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
}
.dsh-desk-recent-item:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
  border-color: var(--dsw-alias-border-l1, #e2e5ea);
}
/* 总览最近便签的色点：与便签纸面同色 + 细环（与色板同一口径）。 */
.dsh-desk-recent-dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid rgba(55, 53, 47, 0.16);
  background: #f4f1ea;
}
.dsh-desk-recent-dot[data-color='default'] { background: #f4f1ea; }
.dsh-desk-recent-dot[data-color='yellow'] { background: #faf3dd; }
.dsh-desk-recent-dot[data-color='green'] { background: #eef3ed; }
.dsh-desk-recent-dot[data-color='blue'] { background: #e9f3f7; }
.dsh-desk-recent-dot[data-color='pink'] { background: #f9f2f5; }
.dsh-desk-recent-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-desk-hint {
  margin: 0;
  padding: 16px;
  border: 1px dashed var(--dsw-alias-border-l1, #e2e5ea);
  border-radius: 12px;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
.dsh-desk-error {
  flex: none;
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-state-error-primary, #c62828);
}
.dsh-desk-btn {
  appearance: none;
  align-self: flex-start;
  box-sizing: border-box;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: inherit;
  font-size: 14px;
  line-height: 20px;
  cursor: pointer;
}
.dsh-desk-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
`

/** 注入样式表并返回 style 元素；调用方负责在卸载时移除。重复安装（HMR）时复用并刷新内容。 */
export function ensureDeskStyles(): HTMLStyleElement {
  const existing = document.querySelector<HTMLStyleElement>(STYLE_SELECTOR)
  if (existing !== null) {
    existing.textContent = DESK_CSS
    return existing
  }
  const style = document.createElement('style')
  style.setAttribute('data-dsh-desk-one', '')
  style.textContent = DESK_CSS
  document.head.appendChild(style)
  return style
}

/** 供 node:test 断言样式表内容（不触碰 DOM）。 */
export const DESK_STYLESHEET = DESK_CSS
