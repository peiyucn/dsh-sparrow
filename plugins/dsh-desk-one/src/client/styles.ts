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
/* 内容列统一限宽居中；悬浮操作组例外（不能吃 100% 宽，否则右定位会被推去左边）。 */
.dsh-desk-page > :not(.dsh-desk-fabstack) {
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
/* 便签标签内部：墙面 / 垃圾桶；右下角留给悬浮操作组。 */
.dsh-desk-notesview {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding-bottom: 96px;
}
/* 墙面：一块可见的背板（细边 + 宿主圆角 + 主题自适应淡色底面），贴纸不再飘在虚空里。
   正好占满剩余高度、**不滚动**；贴纸坐标一律夹在背板内。 */
.dsh-desk-wall {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  border-radius: var(--dsw-radius-xl, 20px);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1, #ffffff) 94%, var(--dsw-alias-label-primary, #1f2329));
}
/* 背板中央的轻提示：双击新建；不拦截鼠标事件。 */
.dsh-desk-wall-tip {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  margin: 0;
  padding: 0 16px;
  text-align: center;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  opacity: 0.7;
  pointer-events: none;
  user-select: none;
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
/* 纸色取 Notion 深色色标的同色相中等深度（比色标浅一档、比旧版纸色深一档）：
   纸面负责“这是一张便签”，色标负责“这是哪个色”。 */
.dsh-desk-note[data-color='default'] { background-color: #e4e0d9; }
.dsh-desk-note[data-color='yellow'] { background-color: #e9d3a3; }
.dsh-desk-note[data-color='green'] { background-color: #bccebb; }
.dsh-desk-note[data-color='blue'] { background-color: #b8cad8; }
.dsh-desk-note[data-color='pink'] { background-color: #e0c0ce; }
.dsh-desk-note-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 26px;
  margin-bottom: 2px;
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
/* 色板：用 Notion 的深色文字色（#C29343 / #548164 / #487CA5 / #B35488 / #787774），
   小尺寸下色相清晰；与纸面同色相、深一档，形成「纸面 + 色标」的分层。 */
.dsh-desk-dot {
  appearance: none;
  width: 12px;
  height: 12px;
  padding: 0;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.dsh-desk-dot:hover {
  transform: scale(1.12);
}
.dsh-desk-dot[data-color='default'] { background: #787774; }
.dsh-desk-dot[data-color='yellow'] { background: #c29343; }
.dsh-desk-dot[data-color='green'] { background: #548164; }
.dsh-desk-dot[data-color='blue'] { background: #487ca5; }
.dsh-desk-dot[data-color='pink'] { background: #b35488; }
.dsh-desk-dot[data-active='true'] {
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.9), 0 0 0 3px rgba(55, 53, 47, 0.55);
}
/* 图标按钮：归档 / 恢复 / 删除等操作一律用图标，文字只留 aria/title。 */
.dsh-desk-iconbtn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: rgba(55, 53, 47, 0.42);
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.dsh-desk-iconbtn svg {
  display: block;
  flex: none;
  width: 16px;
  height: 16px;
}
.dsh-desk-iconbtn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsh-desk-iconbtn-danger:hover {
  color: var(--dsw-alias-state-error-primary, #c62828);
}
/* 墙栏入口：图标 + 计数，宽度按内容自适应。 */
/* 贴纸上的小号图标（垃圾桶）：深墨色常驻，light / dark 主题下都看得清。 */
.dsh-desk-iconbtn-sm {
  width: 26px;
  height: 26px;
}
.dsh-desk-iconbtn-sm svg {
  width: 20px;
  height: 20px;
}
.dsh-desk-note-action {
  color: rgba(55, 53, 47, 0.55);
  opacity: 0;
  transition: opacity 0.12s ease, background 0.12s ease, color 0.12s ease;
}
.dsh-desk-note:hover .dsh-desk-note-action,
.dsh-desk-note:focus-within .dsh-desk-note-action {
  opacity: 1;
}
.dsh-desk-note-action:hover {
  background: rgba(55, 53, 47, 0.08);
  color: rgba(55, 53, 47, 0.92);
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
/* 「＋」：保留原来的悬浮按钮形态，只对齐宿主语言 ——
   圆角用官方控制圆角 token，颜色用官方蓝紫品牌色（浅色 rgb(65,118,230)、深色走 deepseek-450）。 */
.dsh-desk-add {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  padding: 0;
  border: none;
  border-radius: var(--dsw-radius-lg, 16px);
  background: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6);
  color: #ffffff;
  cursor: pointer;
  box-shadow: 0 8px 20px -8px rgba(20, 25, 40, 0.35);
  transition: filter 0.12s ease, transform 0.12s ease;
}
.dsh-desk-add svg {
  display: block;
  flex: none;
  width: 20px;
  height: 20px;
}
.dsh-desk-add:hover {
  filter: brightness(0.94);
}
.dsh-desk-add:active {
  transform: scale(0.97);
}
.dsh-desk-add:disabled {
  opacity: 0.6;
  cursor: default;
}
/* 右下角操作组：同一排、同尺寸、同圆角；＋ 在左，垃圾桶在右。 */
.dsh-desk-fabstack {
  position: absolute;
  right: 28px;
  bottom: 28px;
  z-index: 2;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  width: auto;
  max-width: none;
  margin: 0;
}
.dsh-desk-fab-secondary {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  border-radius: var(--dsw-radius-lg, 16px);
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: var(--dsw-alias-label-secondary, #6b7280);
  cursor: pointer;
  box-shadow: 0 8px 20px -12px rgba(20, 25, 40, 0.3);
  transition: background 0.12s ease, color 0.12s ease;
}
.dsh-desk-fab-secondary svg {
  display: block;
  flex: none;
  width: 22px;
  height: 22px;
}
.dsh-desk-fab-secondary:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-label-primary, #1f2329);
}
/* 垃圾桶计数：叠在图标按钮右上角的小徽标。 */
.dsh-desk-fab-count {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--dsw-alias-label-primary, #1f2329);
  color: var(--dsw-alias-bg-layer-1, #ffffff);
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}
/* 垃圾桶：便签墙内的第二视图（右下角图标进入 / 返回）。 */
.dsh-desk-trash {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.dsh-desk-trash-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.dsh-desk-trash-title {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
/* 清空垃圾桶：用户显式触发（二次确认），不自动清空。 */
.dsh-desk-trash-clear {
  appearance: none;
  border: none;
  background: transparent;
  padding: 2px 6px;
  border-radius: var(--dsw-radius-sm, 8px);
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.dsh-desk-trash-clear:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-state-error-primary, #c62828);
}
.dsh-desk-trash-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.dsh-desk-trash-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 2px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
}
.dsh-desk-trash-dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #787774;
}
.dsh-desk-trash-dot[data-color='default'] { background: #787774; }
.dsh-desk-trash-dot[data-color='yellow'] { background: #c29343; }
.dsh-desk-trash-dot[data-color='green'] { background: #548164; }
.dsh-desk-trash-dot[data-color='blue'] { background: #487ca5; }
.dsh-desk-trash-dot[data-color='pink'] { background: #b35488; }
.dsh-desk-trash-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 20px;
}
.dsh-desk-trash-meta {
  flex: none;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}

/* 总览：内容尚未设计，S0 保持空白占位（owner 2026-11-06：先不投入）。 */
.dsh-desk-overview {
  flex: 1;
  min-height: 0;
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
