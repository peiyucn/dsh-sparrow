/**
 * 桌面页样式表（纯 CSS 文本，由 client half 注入）：页头、标签栏、便签墙、贴纸与「+」按钮。
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
/* 标签栏：今天 / 便签 /（后续：任务 / 日程）。 */
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
/* 墙面：占满剩余高度、可滚动；贴纸在 canvas 内绝对定位。 */
.dsh-desk-wall {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
  margin-bottom: 40px;
  border-radius: 14px;
}
.dsh-desk-canvas {
  position: relative;
  min-width: 100%;
  min-height: 100%;
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
/* 贴纸：便签墙的基本单位。 */
.dsh-desk-note {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 208px;
  min-height: 168px;
  padding: 6px 10px 10px;
  border-radius: 10px;
  background: #f5f5f2;
  color: #2d2b26;
  box-shadow: 0 6px 16px rgba(25, 30, 45, 0.14);
  cursor: grab;
  user-select: none;
  transition: box-shadow 0.12s ease;
}
.dsh-desk-note:hover {
  box-shadow: 0 10px 22px rgba(25, 30, 45, 0.2);
}
.dsh-desk-note:active {
  cursor: grabbing;
}
.dsh-desk-note[data-color='yellow'] { background: #fff0a8; }
.dsh-desk-note[data-color='green'] { background: #d8f0cf; }
.dsh-desk-note[data-color='blue'] { background: #d7e6fb; }
.dsh-desk-note[data-color='pink'] { background: #fbdce6; }
.dsh-desk-note-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 20px;
  margin-bottom: 2px;
}
.dsh-desk-note-colors {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.dsh-desk-note:hover .dsh-desk-note-colors,
.dsh-desk-note:focus-within .dsh-desk-note-colors {
  opacity: 1;
}
.dsh-desk-dot {
  appearance: none;
  width: 12px;
  height: 12px;
  padding: 0;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
}
.dsh-desk-dot[data-color='default'] { background: #d9d9d4; }
.dsh-desk-dot[data-color='yellow'] { background: #f2d35a; }
.dsh-desk-dot[data-color='green'] { background: #7fc98c; }
.dsh-desk-dot[data-color='blue'] { background: #7ba6ea; }
.dsh-desk-dot[data-color='pink'] { background: #ec9cb8; }
.dsh-desk-dot[data-active='true'] {
  border-color: rgba(30, 30, 30, 0.5);
}
.dsh-desk-note-close {
  appearance: none;
  border: none;
  background: transparent;
  padding: 0 2px;
  font-size: 16px;
  line-height: 1;
  color: rgba(45, 43, 38, 0.45);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.dsh-desk-note:hover .dsh-desk-note-close,
.dsh-desk-note:focus-within .dsh-desk-note-close {
  opacity: 1;
}
.dsh-desk-note-close:hover {
  color: var(--dsw-alias-state-error-primary, #c62828);
}
.dsh-desk-note-body {
  box-sizing: border-box;
  flex: 1;
  width: 100%;
  min-height: 120px;
  padding: 0;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
  line-height: 21px;
  cursor: text;
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
