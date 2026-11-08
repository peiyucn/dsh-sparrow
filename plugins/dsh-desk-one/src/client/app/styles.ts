/** Page shell CSS: panel page, header, tabs, overview placeholder, error and retry button. */

export const APP_CSS = `

/* Panel shell. The header is a fixed official-conversation-size overlay; every feature view
   offsets its first line below it. The central column supplies no base font size, so the root
   declares 14px explicitly. */
.dsh-desk-page {
  --dsh-desk-header-h: calc(76px + var(--dsh-frame-top-clearance, 0px));
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 14px;
}
/* Fixed 76px conversation-style header. Plain by default; theme-tone supplies the glass only
   when it is active (see the conditional ::before material below). */
.dsh-desk-header {
  box-sizing: border-box;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 5;
  height: var(--dsh-desk-header-h);
  padding: calc(8px + var(--dsh-frame-top-clearance, 0px)) 28px 0;
  /* Plain official topbar: solid theme surface, no blur. The glass comes only when the
     theme-tone plugin is active (see the conditional rule below). */
  background-color: var(--dsw-alias-bg-base, #ffffff);
  border-bottom: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea);
  overflow: hidden;
}
/* theme-tone active (not "plain"): reuse its official conversation-header glass recipe, so
   DeskOne and the host topbar adapt together instead of DeskOne choosing an effect. */
body:not([data-dsh-theme-tone-plain]):has(> .dsh-theme-tone) .dsh-desk-header {
  background-color: transparent;
  isolation: isolate;
}
body:not([data-dsh-theme-tone-plain]):has(> .dsh-theme-tone) .dsh-desk-header::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-color: color-mix(in srgb, var(--dsw-alias-bg-base, #ffffff) 54%, transparent);
  backdrop-filter: blur(24px) saturate(170%) brightness(1.04);
  -webkit-backdrop-filter: blur(24px) saturate(170%) brightness(1.04);
  background-image:
    radial-gradient(ellipse 80vw 45vh at 50% -10vh, color-mix(in srgb, var(--dsh-theme-tone-top, transparent) 85%, transparent), transparent var(--dsh-theme-tone-top-stop, 62%)),
    radial-gradient(ellipse 38vw 58vh at 0% -6vh, color-mix(in srgb, var(--dsh-theme-tone-left, transparent) 85%, transparent), transparent 68%);
  background-size: 100vw 100vh, 100vw 100vh;
  background-position: 0 0, 0 0;
  background-repeat: no-repeat, no-repeat;
  background-attachment: fixed, fixed;
}

.dsh-desk-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 32px;
  min-width: 0;
}
.dsh-desk-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 0 1 auto;
}
.dsh-desk-brand-mark {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--dsw-alias-label-primary, #1f2329);
  color: var(--dsw-alias-label-primary-inverted, #ffffff);
}
.dsh-desk-info-wrap {
  display: inline-flex;
  flex: none;
  align-items: center;
}
.dsh-desk-info-button {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-caption, #8a919f);
  cursor: pointer;
}
.dsh-desk-info-button:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsh-desk-info-button svg {
  display: block;
  width: 16px;
  height: 16px;
}
.dsh-desk-intro-tooltip {
  box-sizing: border-box;
  padding: 8px 10px;
  border-radius: var(--dsw-radius-sm, 8px);
  background: var(--dsw-menu-surface-fill, var(--dsw-specific-menu, #ffffff));
  backdrop-filter: var(--dsw-menu-backdrop-filter, blur(12px));
  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter, blur(12px));
  box-shadow: var(--dsw-elevation-panel, 0 10px 30px -12px rgba(20, 25, 40, 0.4));
  outline: 0.5px solid var(--dsw-alias-border-l1, #e2e5ea);
  outline-offset: -0.5px;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 12px;
  line-height: 18px;
}
.dsh-desk-title {
  display: inline-flex;
  flex: none;
  align-items: center;
  height: 22px;
  margin: 0;
  padding: 0 7px;
  border-radius: 6px;
  background: var(--dsw-alias-label-primary, #1f2329);
  color: var(--dsw-alias-label-primary-inverted, #ffffff);
  font-size: 13px;
  font-weight: 600;
  line-height: 22px;
  letter-spacing: 0.2px;
  white-space: nowrap;
}
.dsh-desk-intro {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 12px;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-desk-header-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
/* Official two-level tab row: outer gap 20px (viewTabs ↔ More), inner text gap 32px. */
.dsh-desk-tabs {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  min-width: 0;
  min-height: 25px;
  margin-top: 10px;
  padding: 0;
  overflow: visible;
}
.dsh-desk-viewtabs {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 32px;
  min-width: 0;
}
.dsh-desk-tab {
  appearance: none;
  position: relative;
  box-sizing: border-box;
  display: inline-flex;
  flex: none;
  align-items: center;
  /* Official tab geometry: 35px box raised 10px into the row margin; 10px top / 9px bottom
     padding leaves the 16px text line, and the 2px bar sits 1px over the header rule. */
  min-height: 35px;
  margin: -10px -10px 0;
  padding: 10px 10px 9px;
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
  right: 10px;
  bottom: -1px;
  left: 10px;
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
/* Content fills the page; each view offsets its own content below the header. */
.dsh-desk-body {
  box-sizing: border-box;
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
  min-height: 0;
}
.dsh-desk-overview {
  flex: 1;
  min-height: 0;
  padding: calc(var(--dsh-desk-header-h) + 14px) 28px 0;
}
/* Notes wall is full-bleed: it uses the whole page width, only the header keeps its insets. */
.dsh-desk-notesview {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  width: 100%;
}
.dsh-desk-trash-host {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding: calc(var(--dsh-desk-header-h) + 14px) 28px 0;
}
/* Official Button (sm) parity: outlined by default, primary for the single main action. */
.dsh-desk-action {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  box-sizing: border-box;
  /* Official plugin-page toolbar Button: 32px high, 13px text, 12px radius
     (PluginManagerPage .addPrimary/.addMore overrides). */
  height: 32px;
  padding: 0 12px;
  border: 0.5px solid transparent;
  border-radius: var(--dsw-radius-md, 12px);
  background: transparent;
  box-shadow: inset 0 0 0 var(--dsh-hairline-width, 0.5px) var(--dsh-button-outline-color, var(--dsw-alias-border-l3, #e2e5ea));
  color: var(--dsw-alias-label-primary, #1f2329);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
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
.dsh-desk-action-primary {
  border: none;
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
  padding: calc(var(--dsh-desk-header-h) + 14px) 28px 16px;
}

.dsh-desk-sessionsview::-webkit-scrollbar-track {
  margin: calc(var(--dsh-desk-header-h) + 2px) 2px 2px;
  background: transparent;
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
/* Confirming labels are narrower than the default label; reserving the width keeps the
   preceding "back to wall" button from shifting when the confirm state toggles. */
.dsh-desk-action[data-stable-width='true'] {
  min-width: 96px;
}
/* Official More launcher: 22×22, 13px ellipsis icon, hover/expanded fill. */
.dsh-desk-tab-more {
  appearance: none;
  box-sizing: border-box;
  display: inline-flex;
  flex: none;
  align-self: flex-start;
  align-items: center;
  justify-content: center;
  width: 22px;
  min-width: 22px;
  height: 22px;
  margin-top: -3px;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font: inherit;
  line-height: 1;
  cursor: pointer;
}
.dsh-desk-tab-more:hover,
.dsh-desk-tab-more[aria-expanded='true'] {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.dsh-desk-tab-more-icon {
  display: block;
  width: 13px;
  height: 13px;
}
/* Floating page menu: official menu surface tokens (theme-tone aware) and elevation. */
.dsh-desk-tabmenu {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: max-content;
  transform-origin: top left;
  min-width: 160px;
  max-width: min(288px, calc(100vw - 24px));
  padding: 4px;
  border: 0;
  border-radius: var(--dsw-radius-lg, 14px);
  background: var(--dsw-menu-surface-fill, var(--dsw-specific-menu, #ffffff));
  backdrop-filter: var(--dsw-menu-backdrop-filter, blur(12px));
  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter, blur(12px));
  box-shadow: var(--dsw-elevation-panel, 0 10px 30px -12px rgba(20, 25, 40, 0.45));
  outline: 0.5px solid var(--dsw-alias-border-l1, #e2e5ea);
  outline-offset: -0.5px;
}
.dsh-desk-tabmenu-empty {
  margin: 0;
  padding: 10px 12px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
}
.dsh-desk-tabmenu-option {
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
.dsh-desk-tabmenu-option:hover,
.dsh-desk-tabmenu-option:focus-visible {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
  outline: none;
}
.dsh-desk-tabmenu-option[data-active='true'] {
  font-weight: 500;
}
.dsh-desk-tabmenu-check {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: var(--dsw-alias-state-business-primary, #4176e6);
}
.dsh-desk-tabmenu-check svg {
  display: block;
  width: 12px;
  height: 12px;
}
`
