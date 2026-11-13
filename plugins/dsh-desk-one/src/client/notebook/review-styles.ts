/** Review tab styles (official theme aliases only). */

export const REVIEW_CSS = `
.dsh-desk-review {
  container-type: inline-size;
  --dsh-desk-review-bar-h: 36px;
  --dsh-desk-review-bar-bottom: 18px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  position: relative;
  height: 100%;
  min-height: 0;
  padding: 10px 12px 0;
  overflow: hidden;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 12px;
}
/* Conversation-area hint for review sessions: AI avatar + left speech bubble above the composer. */
.dsh-desk-review-prompt {
  box-sizing: border-box;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  max-width: none;
  /* The official input.dock is above the composer; a flex order past the input bar puts the hint
     below it in both the centred hero composer and the docked composer, with no duplicate slot. */
  order: 1;
  /* Match the composer card's horizontal inset so the AI bubble does not sit on the sidebar edge. */
  padding: 0 20px;
  margin: 0;
}
.dsh-desk-review-prompt-avatar {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: var(--dsw-alias-state-business-primary, #4176e6);
  color: var(--dsw-alias-label-primary-foreground, #ffffff);
}
/* Sidebar session-row leading cell: the same blue brand mark as the bubble avatar, miniaturised. */
.dsh-desk-review-session-mark-trailing {
  width: 14px;
  height: 14px;
}
/* Sidebar session-row mark: the note's own markdown file icon, so a review Session is easier to
   pick out than the monochrome brand glyph. */
.dsh-desk-review-session-mark {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}
.dsh-desk-review-prompt-key {
  display: inline-flex;
  align-items: center;
  margin: 0 2px;
  padding: 0 5px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2, #f2f3f5);
  font-size: 11px;
  line-height: 16px;
}
.dsh-desk-review-prompt-text {
  margin: 0;
  padding: 8px 12px;
  border: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea);
  border-radius: 4px 14px 14px 14px;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 12px;
  line-height: 18px;
}

/* Frontmatter disclosure: one compact row when closed, metadata card when opened. */
.dsh-desk-review-fieldcount {
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
/* Frontmatter block: quiet metadata card above the page content (raw frontmatter is stripped from body). */
.dsh-desk-review-frontmatter {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0 0 8px;
  padding: 8px 10px;
  border: 0.5px solid var(--dsw-alias-border-l1, #e2e5ea);
  border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02));
}
.dsh-desk-review-field {
  display: flex;
  gap: 8px;
  min-width: 0;
  font-size: 11px;
  line-height: 16px;
}
.dsh-desk-review-field dt {
  flex: none;
  min-width: 56px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
.dsh-desk-review-field dd {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-secondary, #6b7280);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The notebook-area tab glyph before the review tab title, so the review tab and the 笔记 tab match. */
.dsh-desk-review-tabicon {
  display: inline-flex;
  flex: 0 0 auto;
  margin-right: 4px;
  vertical-align: middle;
}

/* Mirrors the official document-preview header: 38px row, official viewer-tool button, hairline. */
.dsh-desk-review-head {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  box-sizing: border-box;
  height: 38px;
  padding: 0 6px 0 12px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12));
}
/* Compact the official sm segmented control to the toolbar's 28px tool row: the stock sm track is
   34px tall with 14px labels, noticeably heavier than the ghost icon buttons beside it. */
.dsh-desk-review-viewtoggle {
  flex: none;
  width: auto;
  height: 28px;
  padding: 2px;
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  box-shadow: inset 0 0 0 0.5px var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
}
.dsh-desk-review-viewtoggle [role='tab'] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0 10px;
  border-radius: var(--dsw-radius-sm, 6px);
  background: transparent;
  box-shadow: none;
  font-size: 12px;
  line-height: 1;
}
.dsh-desk-review-viewtoggle [role='tab'][aria-selected='true'] {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06));
  color: var(--dsw-alias-label-primary, #1f2329);
  box-shadow: none;
}
.dsh-desk-review-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
}
.dsh-desk-review-kind {
  flex: none;
  padding: 0 5px;
  border-radius: 4px;
  background: var(--dsw-alias-interactive-bg-secondary, rgba(0, 0, 0, 0.06));
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 9px;
  line-height: 16px;
  letter-spacing: 0.04em;
}
.dsh-desk-review-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 2px 12px;
}
.dsh-desk-review-card {
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02));
}
.dsh-desk-review-card h4 {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
}
.dsh-desk-review-field {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 3px 0;
}
.dsh-desk-review-field-name {
  flex: none;
  min-width: 64px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 11px;
}
.dsh-desk-review-field-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}
.dsh-desk-review-body {
  font-size: 13px;
  line-height: 1.7;
}
.dsh-desk-review-body ::selection {
  background: var(--dsw-alias-bg-document-selection, rgba(65, 118, 230, 0.4));
}
.dsh-desk-review-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--dsw-alias-font-mono, ui-monospace, monospace);
  font-size: 12px;
  line-height: 1.6;
}
/* Official pill-dialog layout: fixed title row with icon, content scrolls on its own. */
.dsh-desk-review-layer {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: calc(var(--dsh-desk-review-bar-h) + var(--dsh-desk-review-bar-bottom) + 4px);
  z-index: 4;
  display: flex;
  flex-direction: column;
  max-height: 60%;
  overflow: hidden;
  padding: 0;
  border-radius: var(--dsw-radius-lg, 14px);
  background: var(--dsw-menu-surface-fill, var(--dsw-specific-menu, #ffffff));
  backdrop-filter: var(--dsw-menu-backdrop-filter, blur(12px));
  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter, blur(12px));
  box-shadow: var(--dsw-elevation-panel, 0 -6px 24px rgba(0, 0, 0, 0.16));
  outline: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.06));
  outline-offset: -0.5px;
}
.dsh-desk-review-layerhead {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 8px 12px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.06));
}
.dsh-desk-review-layericon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-desk-review-layericon svg {
  width: 16px;
  height: 16px;
}
.dsh-desk-review-layerbody {
  min-height: 0;
  overflow-y: auto;
  padding: 10px 12px 12px;
}
.dsh-desk-review-record {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px 0;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.06));
}
.dsh-desk-review-record:first-child {
  padding-top: 0;
  border-top: 0;
}
.dsh-desk-review-recordehead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 11px;
  line-height: 16px;
}
.dsh-desk-review-layerhead h4 {
  flex: 1;
  margin: 0;
  font-size: 12px;
  font-weight: 600;
}
.dsh-desk-review-baseline {
  color: var(--dsw-alias-label-caption, #8a919f);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.dsh-desk-review-pending {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 0;
  border-top: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.04));
}
.dsh-desk-review-pending-no {
  flex: none;
  width: 16px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.dsh-desk-review-pending-main {
  flex: 1;
  min-width: 0;
}
.dsh-desk-review-pending-text {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
.dsh-desk-review-quote {
  margin: 0;
  padding: 0 0 0 8px;
  border-left: 2px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12));
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.dsh-desk-review-quote-inline {
  max-height: 96px;
  overflow: hidden;
}
.dsh-desk-review-lines {
  margin: 4px 0 0;
  color: var(--dsw-alias-label-caption, #8a919f);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
/* The composer occupies exactly the slot a saved annotation will take: same left rail,
   same indent under the line numbers, same card rhythm. */
.dsh-desk-review-composer {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 2px 0 6px 2.6em;
  padding: 6px 8px;
  border-left: 2px solid var(--dsw-alias-brand-primary, #4176e6);
  border-radius: var(--dsw-radius-sm, 8px);
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.03));
}
.dsh-desk-review-composer .dsh-desk-review-quote {
  padding-left: 0;
  border-left: 0;
  font-size: 11px;
}
.dsh-desk-review-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 56px;
  max-height: 160px;
  padding: 5px 8px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12));
  border-radius: var(--dsw-radius-sm, 8px);
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2329);
  font: inherit;
  font-size: 12px;
  line-height: 1.6;
  resize: vertical;
}
.dsh-desk-review-input::placeholder {
  color: var(--dsw-alias-label-caption, #8a919f);
}
.dsh-desk-review-input:focus {
  outline: none;
  border-color: var(--dsw-alias-brand-primary, #4176e6);
}
.dsh-desk-review-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}
.dsh-desk-review-notice {
  margin: 0 0 8px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.04));
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02));
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 11px;
}

.dsh-desk-review-code {
  flex: 1;
  min-height: 0;
  overflow-x: auto;
  padding: 6px 0;
  font-family: var(--dsw-alias-font-mono, ui-monospace, monospace);
  font-size: 12px;
  line-height: 1.55;
}
.dsh-desk-review-line {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 0 2px;
  border-radius: 3px;
  white-space: pre-wrap;
  word-break: break-word;
}
.dsh-desk-review-line[data-marked] {
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #4176e6) 12%, transparent);
}
.dsh-desk-review-lineno {
  flex: none;
  min-width: 2.6em;
  text-align: right;
  color: var(--dsw-alias-label-caption, #8a919f);
  user-select: none;
  font-variant-numeric: tabular-nums;
}
.dsh-desk-review-source {
  flex: 1;
  min-width: 0;
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsh-desk-review-anno {
  margin: 2px 0 6px 2.6em;
  padding: 6px 8px;
  border-left: 2px solid var(--dsw-alias-state-business-primary, #4176e6);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.03));
}
.dsh-desk-review-annohead {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.dsh-desk-review-annorange {
  color: var(--dsw-alias-state-business-primary, #4176e6);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.dsh-desk-review-annoquote {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-caption, #8a919f);
  font-size: 10px;
}
.dsh-desk-review-annotext {
  margin: 4px 0 0;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-family: var(--dsw-alias-font-base, system-ui, sans-serif);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
}
.dsh-desk-review-float {
  position: absolute;
  z-index: 50;
  padding: 4px 10px;
  border: 0;
  border-radius: 999px;
  background: var(--dsw-alias-state-business-primary, #4176e6);
  color: #ffffff;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  box-shadow: var(--dsw-elevation-prominent, 0 4px 12px rgba(0, 0, 0, 0.2));
}
/* The element also carries .dsh-desk-action, whose generic hover would paint it white; keep the
   primary action blue and deepen it like the composer's send button. */
.dsh-desk-review-float:hover {
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #4176e6) 84%, #000000);
}
.dsh-desk-review-difftag {
  display: inline-flex;
  align-items: center;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.dsh-desk-review-difftag-plus {
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary, #3a9a5b) 16%, transparent);
  color: var(--dsw-alias-state-success-primary, #3a9a5b);
}
.dsh-desk-review-difftag-minus {
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #c0503f) 16%, transparent);
  color: var(--dsw-alias-state-error-primary, #c0503f);
}

.dsh-desk-review-diffadded {
  color: var(--dsw-alias-code-diff-added, #3a9a5b);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.dsh-desk-review-diffremoved {
  color: var(--dsw-alias-code-diff-deleted, #c0503f);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
/* --- v4: view toggle, selected lines, inline composer, segmented bar ------ */

.dsh-desk-review-line[data-selected] {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4176e6) 18%, transparent);
}
.dsh-desk-review-float {
  padding: 2px 10px;
  font-size: 11px;
  border-radius: 999px;
}
.dsh-desk-review-rendered {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 4px 12px;
  font-size: 13px;
  line-height: 1.7;
}

.dsh-desk-docreview {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  /* Brand-primary turns near-white in the dark theme; the business state color stays a real
     brand fill in both themes, which is what the coloured preview-header action needs. */
  background: var(--dsw-alias-state-business-primary, #4176e6);
  color: var(--dsw-alias-label-primary-foreground, #ffffff);
  cursor: pointer;
}
.dsh-desk-docreview:hover {
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #4176e6) 84%, #000000);
}
.dsh-desk-docreview:disabled {
  opacity: 0.5;
  cursor: default;
}
/* Official composer-pill reading: transparent, centred pills on the pane floor. */
.dsh-desk-review-bar {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: var(--dsh-desk-review-bar-bottom);
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: var(--dsh-desk-review-bar-h);
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
  pointer-events: none;
}
/* Fade the last lines into the pane ground, mirroring the official @ / slash composer lists. */
.dsh-desk-review::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: calc(var(--dsh-desk-review-bar-h) + var(--dsh-desk-review-bar-bottom) + 24px);
  z-index: 2;
  pointer-events: none;
  background: linear-gradient(
    to top,
    var(--dsw-alias-bg-base, #151517) 18%,
    color-mix(in srgb, var(--dsw-alias-bg-base, #151517) 72%, transparent) 55%,
    transparent 100%
  );
}
.dsh-desk-review-bar > * {
  pointer-events: auto;
}
/* Split action controls: official task-page create-button geometry (main label + chevron menu)
   painted with the OFFICIAL primary-button tokens. In the dark theme that token is the near-white
   primary fill with dark ink (the clean white the rest of the app uses); no hand-made glass. */
.dsh-desk-review-split {
  display: inline-flex;
  flex: 0 1 auto;
  align-items: stretch;
  box-sizing: border-box;
  min-width: 0;
  height: var(--dsh-desk-review-bar-h);
  border-radius: 999px;
  background: var(--dsw-alias-button-primary-fill, #4176e6);
  color: var(--dsw-alias-label-primary-foreground, #ffffff);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  font-size: 13px;
  line-height: 20px;
}
.dsh-desk-review-split-main,
.dsh-desk-review-split-arrow {
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  height: 100%;
  margin: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.dsh-desk-review-split-main {
  gap: 8px;
  min-width: 0;
  padding: 0 12px 0 16px;
  border-radius: 999px 0 0 999px;
}
.dsh-desk-review-split-icon {
  display: inline-flex;
  flex: none;
}
.dsh-desk-review-split-icon svg {
  width: 16px;
  height: 16px;
}
.dsh-desk-review-split-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
.dsh-desk-review-split-count,
.dsh-desk-review-split-muted {
  flex: none;
  color: color-mix(in srgb, currentColor 68%, transparent);
  font-size: 12px;
}
.dsh-desk-review-split > .dsh-desk-review-difftag,
.dsh-desk-review-split-main > .dsh-desk-review-difftag {
  flex: none;
}
.dsh-desk-review-split-arrow {
  flex: none;
  justify-content: center;
  width: 32px;
  padding: 0;
  border-left: 0.5px solid color-mix(in srgb, currentColor 22%, transparent);
  border-radius: 0 999px 999px 0;
}
.dsh-desk-review-split-arrow svg {
  width: 14px;
  height: 14px;
}
.dsh-desk-review-split-main:hover,
.dsh-desk-review-split-arrow:hover,
.dsh-desk-review-split-arrow[aria-expanded='true'] {
  background: color-mix(in srgb, currentColor 10%, transparent);
}
.dsh-desk-review-split:has(.dsh-desk-review-split-main:hover),
.dsh-desk-review-split:has(.dsh-desk-review-split-arrow:hover) {
  background: var(--dsw-alias-button-primary-hover, #3568d4);
}
.dsh-desk-review-split-main:focus-visible,
.dsh-desk-review-split-arrow:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #4176e6);
  outline-offset: 2px;
}
.dsh-desk-review-split-main:disabled {
  cursor: default;
  opacity: 0.4;
}
.dsh-desk-review-split-main:disabled:hover {
  background: transparent;
}
@container (max-width: 430px) {
  .dsh-desk-review-bar {
    left: 8px;
    right: 8px;
    gap: 6px;
  }
  .dsh-desk-review-split-main {
    gap: 6px;
    padding: 0 10px;
  }
  .dsh-desk-review-split-arrow {
    width: 26px;
  }
}
/* The chevron menus use the same official primary surface as their button, so the pair reads as
   one control instead of a dark menu card floating over a white button. */
.dsh-desk-review-menu {
  border: 0 !important;
  border-radius: var(--dsw-radius-lg, 14px) !important;
  background: var(--dsw-alias-button-primary-fill, #4176e6) !important;
  color: var(--dsw-alias-label-primary-foreground, #ffffff) !important;
  box-shadow: var(--dsw-elevation-prominent, 0 10px 30px -12px rgba(20, 25, 40, 0.45)) !important;
}
.dsh-desk-review-menu > [class*='material'] {
  background: transparent !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
.dsh-desk-review-menu [role='menuitem'] {
  color: inherit !important;
  border-radius: var(--dsw-radius-sm, 8px) !important;
}
.dsh-desk-review-menu [role='menuitem']:hover,
.dsh-desk-review-menu [role='menuitem']:focus-visible {
  background: color-mix(in srgb, currentColor 12%, transparent) !important;
}
.dsh-desk-review-menu [role='menuitem'] svg {
  color: inherit;
}
/* Square brand-icon button in the official preview header (official Button geometry).
   The doubled class beats the host Button's primary fill, which is near-white in dark theme. */
button.dsh-desk-docreview.dsh-desk-docreview {
  flex: none;
  min-width: 28px;
  padding: 0;
  background: var(--dsw-alias-state-business-primary, #4176e6);
  color: var(--dsw-alias-label-primary-foreground, #ffffff);
}
button.dsh-desk-docreview.dsh-desk-docreview:hover {
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #4176e6) 84%, #000000);
  color: var(--dsw-alias-label-primary-foreground, #ffffff);
}
`
