/** Notes feature CSS: wall, sticky card, bottom actions, trash view and Smash animation. */

export const NOTES_CSS = `
/* 便签标签内部：墙面 / 垃圾桶；右下角留给悬浮操作组。 */
/* 便签标签内部：墙面 / 垃圾桶，铺满整个可用区域（不再为悬浮按钮预留空白）。 */
.dsh-desk-notesview {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
/* 墙面：正好占满剩余高度、**不滚动**；贴纸坐标一律夹在可见区域内。
   不加背板（owner 2026-11-06：背板显脏且缩小操作面积），沿用页面本身的干净底。 */
.dsh-desk-wall {
  position: relative;
  z-index: 0; /* 建立层级上下文：贴纸的 z 再大也只在墙内比较，按钮永远盖在它们上面。 */
  flex: 1;
  min-height: 0;
  /* Fixed width, vertically infinite canvas: notes may live below the viewport and the wall
     scrolls to them. Horizontal overflow stays clipped so the width never changes. */
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--dsw-alias-label-primary, #1f2329) 24%, transparent) transparent;
}
.dsh-desk-wall::-webkit-scrollbar {
  width: 8px;
}
.dsh-desk-wall::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 4px;
  background: color-mix(in srgb, var(--dsw-alias-label-primary, #1f2329) 24%, transparent);
  background-clip: content-box;
}
.dsh-desk-wall::-webkit-scrollbar-track {
  background: transparent;
}
/* 空墙中央的轻提示：双层排版（主提示 + 次提示），颜色压到很浅，不抢贴纸。 */
.dsh-desk-wall-tip {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0;
  padding: 0 16px;
  text-align: center;
  pointer-events: none;
  user-select: none;
}
.dsh-desk-wall-tip-main {
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  letter-spacing: 0.04em;
  color: color-mix(in srgb, var(--dsw-alias-label-primary, #1f2329) 26%, transparent);
}
.dsh-desk-wall-tip-sub {
  font-size: 11px;
  font-weight: 400;
  line-height: 16px;
  letter-spacing: 0.02em;
  color: color-mix(in srgb, var(--dsw-alias-label-primary, #1f2329) 16%, transparent);
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
/* Dragging a sticky tilts it slightly — the physical-paper cue the task board deliberately lacks. */
.dsh-desk-note[data-dragging='true'] {
  transform: rotate(-1.4deg);
  box-shadow: 0 10px 26px -12px rgba(24, 28, 40, 0.45);
  cursor: grabbing;
  z-index: 100000;
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
/* 贴纸上的小号图标（垃圾桶）：深墨色常驻，light / dark 主题下都看得清。 */
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
/* 右下角改大小：热区放大到 26px（好抓），可见角标仍是极简的两条细线（画在伪元素上）。 */
.dsh-desk-note-resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 26px;
  height: 26px;
  cursor: nwse-resize;
  touch-action: none;
}
.dsh-desk-note-resize::after {
  content: '';
  position: absolute;
  right: 6px;
  bottom: 6px;
  width: 8px;
  height: 8px;
  border-right: 1.5px solid rgba(55, 53, 47, 0.32);
  border-bottom: 1.5px solid rgba(55, 53, 47, 0.32);
  border-bottom-right-radius: 1px;
  opacity: 0;
  transition: opacity 0.12s ease, border-color 0.12s ease;
}
.dsh-desk-note:hover .dsh-desk-note-resize::after,
.dsh-desk-note:focus-within .dsh-desk-note-resize::after {
  opacity: 1;
}
.dsh-desk-note-resize:hover::after {
  border-color: rgba(55, 53, 47, 0.6);
}
/* Smash 动画：贴纸依次向上飞散、淡出；落库在动画结束后统一进行。 */
@keyframes dsh-desk-smash-out {
  from { opacity: 1; transform: translateY(0) rotate(0deg) scale(1); }
  to { opacity: 0; transform: translateY(-16px) rotate(-4deg) scale(0.94); }
}
.dsh-desk-note-smashing {
  animation: dsh-desk-smash-out 260ms ease-in forwards;
  pointer-events: none;
}
/* 垃圾桶：便签墙内的第二视图（右下角图标进入 / 返回）。 */
.dsh-desk-trash {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
  /* 列表滚到底时留出悬浮按钮的高度，最后一行不被按钮盖住。 */
  padding-bottom: 88px;
}
.dsh-desk-trash-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.dsh-desk-trash-count {
  margin-left: 8px;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
.dsh-desk-trash-actions {
  display: flex;
  align-items: center;
  gap: 4px;
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

`
