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
  padding: 0;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 14px;
}
/* Content column; chrome and dock are normal-flow siblings above this body. */
.dsh-desk-page > * {
  width: 100%;
  max-width: 960px;
  margin-left: auto;
  margin-right: auto;
}
.dsh-desk-body {
  box-sizing: border-box;
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
  max-width: 960px;
  min-height: 0;
  margin-left: auto;
  margin-right: auto;
  padding: 0 clamp(20px, 3vw, 40px);
}
.dsh-desk-overview {
  padding-top: 18px;
}
.dsh-desk-notesview {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}
.dsh-desk-trash-host {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding-top: 18px;
}
/* Glass chrome copied from the theme-tone recipe used by the conversation and right-sidebar
   headers: the header is an absolute overlay, content scrolls beneath it and is blurred.
   The menu itself stays theme-neutral (no brand fill / white text). */
.dsh-desk-chrome {
  box-sizing: border-box;
  position: relative;
  z-index: 5;
  flex: none;
  padding: 28px 0 0;
  background: color-mix(in srgb, var(--dsw-alias-bg-base, #ffffff) 54%, transparent);
  backdrop-filter: blur(24px) saturate(170%) brightness(1.04);
  -webkit-backdrop-filter: blur(24px) saturate(170%) brightness(1.04);
  border-bottom: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea);
}
.dsh-desk-chrome-inner {
  box-sizing: border-box;
  width: 100%;
  max-width: 960px;
  margin-left: auto;
  margin-right: auto;
  padding-left: clamp(24px, 4vw, 48px);
  padding-right: clamp(24px, 4vw, 48px);
}
html[data-platform='darwin'] .dsh-desk-chrome {
  padding-top: calc(28px + var(--dsh-frame-top-clearance, 0px));
}
/* Without backdrop blur the translucent bar would let content fight the text: use a solid bar. */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .dsh-desk-chrome {
    background: var(--dsw-alias-bg-base, #ffffff);
  }
}
/* Row 1: brand title (official plugin-page position) + this view's actions on the right. */
.dsh-desk-chrome-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
  min-height: 35px;
}
.dsh-desk-title {
  flex: none;
  margin: 0;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 20px;
  font-weight: 500;
  line-height: 28px;
  white-space: nowrap;
}
.dsh-desk-header-actions {
  display: flex;
  flex: 0 1 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}
/* Row 2: official conversation tabs: plain text, 32px gap, 2px active underline. */
.dsh-desk-tabs {
  display: flex;
  align-items: flex-start;
  gap: 32px;
  min-width: 0;
  margin-top: 4px;
  padding: 0;
  background: transparent;
  flex-wrap: wrap;
}
.dsh-desk-tab {
  appearance: none;
  position: relative;
  box-sizing: border-box;
  min-height: 35px;
  margin: 0;
  padding: 10px 0 9px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 13px;
  font-weight: 500;
  line-height: 16px;
  white-space: nowrap;
  cursor: pointer;
  transition: color 160ms ease;
}
.dsh-desk-tab:hover {
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsh-desk-tab::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  border-radius: 2px;
  background: transparent;
}
.dsh-desk-tab[data-active='true'] {
  color: var(--dsw-alias-state-business-primary, #4176e6);
}
.dsh-desk-tab[data-active='true']::after {
  background: var(--dsw-alias-state-business-primary, #4176e6);
}
.dsh-desk-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
/* Official Button (sm) parity: outlined by default, primary for the single main action. */
.dsh-desk-action {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  box-sizing: border-box;
  height: 28px;
  padding: 0 10px;
  border: 0.5px solid transparent;
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  box-shadow: inset 0 0 0 var(--dsh-hairline-width, 0.5px) var(--dsh-button-outline-color, var(--dsw-alias-border-l3, #e2e5ea));
  color: var(--dsw-alias-label-primary, #1f2329);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease, box-shadow 0.12s ease;
}
.dsh-desk-action:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.dsh-desk-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.dsh-desk-action svg {
  display: block;
  flex: none;
  width: 13px;
  height: 13px;
}
.dsh-desk-action[data-active='true'] {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-label-primary, #1f2329);
  font-weight: 500;
}
.dsh-desk-action-primary {
  border-color: transparent;
  background: var(--dsw-alias-button-primary-fill, #4176e6);
  box-shadow: none;
  color: var(--dsw-alias-label-primary-foreground, #ffffff);
}
.dsh-desk-action-primary:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover, #3568d4);
  color: var(--dsw-alias-label-primary-foreground, #ffffff);
}
.dsh-desk-action[data-danger='true'] {
  color: var(--dsw-alias-state-error-primary, #c62828);
  box-shadow: inset 0 0 0 var(--dsh-hairline-width, 0.5px) color-mix(in srgb, var(--dsw-alias-state-error-primary, #c62828) 40%, transparent);
}
.dsh-desk-action[data-danger='true']:hover:not(:disabled) {
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #c62828) 8%, transparent);
}
/* Sort dropdown: one compact trigger; options follow the official Menu card semantics. */
.dsh-desk-sort-trigger {
  white-space: nowrap;
}
.dsh-desk-sort-chevron {
  width: 12px !important;
  height: 12px !important;
  opacity: 0.7;
}
.dsh-desk-sort-menu {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 4px;
  border: 0;
  border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  box-shadow: var(--dsw-elevation-prominent, 0 10px 30px -12px rgba(20, 25, 40, 0.45));
  outline: 0.5px solid var(--dsw-alias-border-l1, #e2e5ea);
  outline-offset: -0.5px;
}
.dsh-desk-sort-option {
  appearance: none;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: none;
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: var(--dsw-alias-label-primary, #1f2329);
  font: inherit;
  font-size: 13px;
  line-height: 18px;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}
.dsh-desk-sort-option:hover,
.dsh-desk-sort-option:focus-visible {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
  outline: none;
}
.dsh-desk-sort-option[data-active='true'] {
  font-weight: 500;
}
.dsh-desk-sort-check {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6);
}
.dsh-desk-sort-check svg {
  display: block;
  width: 12px;
  height: 12px;
}/* Unified object-level icon button (task cards, group headers, note cards and trash rows). */
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
/* Sessions view: read-only active catalog (grouped by workspace) + archived tree. */
.dsh-desk-sessionsview {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 2px 0 16px;
}
.dsh-desk-session-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dsh-desk-session-section-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.dsh-desk-session-section-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}
.dsh-desk-session-section-count {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
.dsh-desk-session-section-note {
  margin: -2px 0 0;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
.dsh-desk-session-group {
  border: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  border-radius: var(--dsw-radius-sm, 8px);
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
}
.dsh-desk-session-group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1, #ffffff) 82%, var(--dsw-alias-label-primary, #1f2329));
}
.dsh-desk-session-group-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-desk-session-group-count {
  flex: none;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
.dsh-desk-session-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.dsh-desk-session-row {
  appearance: none;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 12px;
  border: none;
  border-top: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1, #e2e5ea) 70%, transparent);
  background: transparent;
  color: var(--dsw-alias-label-primary, #1f2329);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dsh-desk-session-list li:first-child .dsh-desk-session-row {
  border-top: none;
}
.dsh-desk-session-row:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.dsh-desk-session-row:disabled {
  cursor: default;
  opacity: 0.62;
}
.dsh-desk-session-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.dsh-desk-session-row-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  line-height: 18px;
}
.dsh-desk-session-tag {
  flex: none;
  padding: 0 5px;
  border: 1px solid var(--dsw-alias-border-l2, #cfd4dc);
  border-radius: 999px;
  font-size: 10px;
  line-height: 14px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
.dsh-desk-session-row-meta {
  flex: none;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
.dsh-desk-session-row[data-state='running'] .dsh-desk-session-row-meta {
  color: #2e9e5b;
}
.dsh-desk-session-row[data-state='archived'] .dsh-desk-session-row-main {
  color: var(--dsw-alias-label-secondary, #6b7280);
}
`
