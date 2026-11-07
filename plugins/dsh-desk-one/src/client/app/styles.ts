/** Page shell CSS: panel page, header, tabs, overview placeholder, error and retry button. */

export const APP_CSS = `

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
/* 内容列统一限宽居中（顶栏与内容同宽）。 */
.dsh-desk-page > * {
  width: 100%;
  max-width: 960px;
  margin-left: auto;
  margin-right: auto;
}
/* Command row: title + tabs + the active view's actions share one line. */
.dsh-desk-head {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 14px;
  padding-top: 28px;
  margin-bottom: 10px;
  flex: none;
  min-height: 32px;
}
html[data-platform='darwin'] .dsh-desk-head {
  padding-top: calc(28px + var(--dsh-frame-top-clearance, 0px));
}
.dsh-desk-title {
  margin: 0;
  flex: none;
  font-size: 18px;
  font-weight: 600;
  line-height: 28px;
  white-space: nowrap;
}
.dsh-desk-subtitle {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
/* Tabs are a segmented control so they share the button language of the actions on the right. */
.dsh-desk-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  border-radius: 8px;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1, #ffffff) 55%, transparent);
  flex: none;
}
.dsh-desk-tab {
  appearance: none;
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-size: 13px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.dsh-desk-tab:hover {
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsh-desk-tab[data-active='true'] {
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2329);
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(20, 25, 40, 0.08);
}
/* Contextual actions for the active tab: one shared button primitive for both views. */
.dsh-desk-head-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}
.dsh-desk-action {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  box-sizing: border-box;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: var(--dsw-alias-label-secondary, #6b7280);
  font: inherit;
  font-size: 13px;
  line-height: 18px;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}
.dsh-desk-action:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsh-desk-action:disabled {
  opacity: 0.5;
  cursor: default;
}
.dsh-desk-action svg {
  display: block;
  flex: none;
  width: 16px;
  height: 16px;
}
.dsh-desk-action[data-active='true'] {
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6) 45%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6) 10%, transparent);
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6);
  font-weight: 600;
}
.dsh-desk-action-primary {
  border-color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6);
  background: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6);
  color: #ffffff;
  font-weight: 600;
}
.dsh-desk-action-primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6) 84%, #000000);
  color: #ffffff;
}
.dsh-desk-action[data-danger='true'] {
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary, #c62828) 40%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #c62828) 8%, transparent);
  color: var(--dsw-alias-state-error-primary, #c62828);
}
.dsh-desk-segmented {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
}
.dsh-desk-segment {
  appearance: none;
  height: 22px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
  cursor: pointer;
}
.dsh-desk-segment:hover {
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsh-desk-segment[data-active='true'] {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6) 12%, transparent);
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6);
  font-weight: 600;
}
@media (max-width: 640px) {
  .dsh-desk-title {
    display: none;
  }
  .dsh-desk-action-label {
    display: none;
  }
  .dsh-desk-action {
    padding: 0 7px;
  }
}
/* Unified object-level icon button (task cards, group headers, note cards and trash rows). */
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
  color: var(--dsw-alias-label-tertiary, #8a919f);
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
.dsh-desk-iconbtn-danger[data-confirm='true'] {
  color: var(--dsw-alias-state-error-primary, #c62828);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #c62828) 10%, transparent);
}
.dsh-desk-iconbtn-sm {
  width: 20px;
  height: 20px;
}
.dsh-desk-iconbtn-sm svg {
  width: 14px;
  height: 14px;
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
