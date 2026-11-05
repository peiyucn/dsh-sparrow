/**
 * 桌面页样式表（纯 CSS 文本，由 client half 注入）：页头、标签栏、便签网格、编辑器与按钮。
 * 拆成独立模块：node:test 可脱离 React 组件直接验证注入 / 复用 / 移除。
 */

import { STYLE_SELECTOR } from '../constants.js'

const DESK_CSS = `
/* 主面板页面：官方入口型页面同款（居中内容列，整页滚动；标题行自带 28px 顶内边距，
   macOS 下再让出窗口顶带）。 ⚠️ 中央列不提供基准字号，页面根必须显式给 14px。 */
.dsh-desk-page {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
  padding: 0 clamp(24px, 4vw, 48px) 32px;
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
  margin-bottom: 12px;
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
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
/* 标签栏：今天 / 便签 /（后续：任务 / 日程）。 */
.dsh-desk-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  margin-bottom: 16px;
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
.dsh-desk-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}
.dsh-desk-search {
  box-sizing: border-box;
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: inherit;
  font-size: 14px;
  line-height: 20px;
}
.dsh-desk-btn {
  appearance: none;
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
.dsh-desk-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.dsh-desk-btn-primary {
  background: var(--dsw-alias-label-primary, #1f2329);
  border-color: var(--dsw-alias-label-primary, #1f2329);
  color: var(--dsw-alias-bg-layer-1, #ffffff);
}
.dsh-desk-btn-primary:hover {
  opacity: 0.9;
  background: var(--dsw-alias-label-primary, #1f2329);
}
.dsh-desk-composer {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  margin-bottom: 16px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
}
.dsh-desk-input,
.dsh-desk-textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
}
.dsh-desk-textarea {
  min-height: 80px;
  resize: vertical;
}
.dsh-desk-composer-foot {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.dsh-desk-swatches {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-right: auto;
}
.dsh-desk-swatch {
  appearance: none;
  width: 20px;
  height: 20px;
  padding: 0;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
}
.dsh-desk-swatch[data-active='true'] {
  border-color: var(--dsw-alias-label-primary, #1f2329);
}
.dsh-desk-swatch[data-color='default'] { background: #d1d5db; }
.dsh-desk-swatch[data-color='yellow'] { background: #f5c84c; }
.dsh-desk-swatch[data-color='green'] { background: #79c98b; }
.dsh-desk-swatch[data-color='blue'] { background: #7aa7f0; }
.dsh-desk-swatch[data-color='pink'] { background: #f0a3bd; }
.dsh-desk-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.dsh-desk-card {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  border-left-width: 4px;
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  min-height: 96px;
}
.dsh-desk-card[data-color='default'] { border-left-color: #d1d5db; }
.dsh-desk-card[data-color='yellow'] { border-left-color: #f5c84c; }
.dsh-desk-card[data-color='green'] { border-left-color: #79c98b; }
.dsh-desk-card[data-color='blue'] { border-left-color: #7aa7f0; }
.dsh-desk-card[data-color='pink'] { border-left-color: #f0a3bd; }
.dsh-desk-card-title {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  word-break: break-word;
}
.dsh-desk-card-body {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  white-space: pre-wrap;
  word-break: break-word;
  flex: 1;
}
.dsh-desk-card-foot {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
}
.dsh-desk-meta {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
.dsh-desk-card-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.dsh-desk-card:hover .dsh-desk-card-actions,
.dsh-desk-card:focus-within .dsh-desk-card-actions {
  opacity: 1;
}
.dsh-desk-link {
  appearance: none;
  border: none;
  background: transparent;
  padding: 2px 6px;
  border-radius: 6px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
.dsh-desk-link:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsh-desk-link-danger:hover {
  color: var(--dsw-alias-state-error-primary, #c62828);
}
.dsh-desk-pin {
  appearance: none;
  border: none;
  background: transparent;
  padding: 0 4px 0 0;
  font-size: 14px;
  line-height: 20px;
  cursor: pointer;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
.dsh-desk-pin[data-active='true'] {
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsh-desk-today {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dsh-desk-stats {
  font-size: 14px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-desk-section-title {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
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
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-state-error-primary, #c62828);
}
.dsh-desk-empty {
  padding: 24px 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
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
