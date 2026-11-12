/** Review tab styles (official theme aliases only). */

export const REVIEW_CSS = `
.dsh-desk-review {
  --dsh-desk-review-bar-h: 34px;
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
.dsh-desk-review-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 8px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.04));
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
  padding: 10px 2px calc(var(--dsh-desk-review-bar-h) + 14px);
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
.dsh-desk-review-layer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: var(--dsh-desk-review-bar-h);
  z-index: 4;
  max-height: 60%;
  overflow-y: auto;
  padding: 10px 12px 12px;
  border-top: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  border-radius: 10px 10px 0 0;
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  box-shadow: var(--dsw-elevation-panel, 0 -6px 24px rgba(0, 0, 0, 0.16));
}
.dsh-desk-review-layerhead {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 8px;
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
.dsh-desk-review-mini {
  flex: none;
  padding: 2px 6px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 10px;
  cursor: pointer;
}
.dsh-desk-review-mini:hover {
  color: var(--dsw-alias-label-primary, #1f2329);
  border-color: var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12));
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
.dsh-desk-review-viewtoggle {
  display: inline-flex;
  flex: none;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  border-radius: 8px;
  overflow: hidden;
}
.dsh-desk-review-viewtoggle button {
  padding: 2px 8px;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font: inherit;
  font-size: 10px;
  cursor: pointer;
}
.dsh-desk-review-viewtoggle button[data-active] {
  color: var(--dsw-alias-label-primary, #1f2329);
  background: var(--dsw-alias-interactive-bg-secondary, rgba(0, 0, 0, 0.06));
}
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
  padding: 8px 4px calc(var(--dsh-desk-review-bar-h) + 12px);
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
  background: var(--dsw-alias-brand-primary, #4176e6);
  color: #ffffff;
  cursor: pointer;
}
.dsh-desk-docreview:hover {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4176e6) 84%, #000000);
}
.dsh-desk-docreview:disabled {
  opacity: 0.5;
  cursor: default;
}
/* Official composer-pill reading: transparent pills on the pane floor. */
.dsh-desk-review-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: none;
  height: var(--dsh-desk-review-bar-h);
  padding: 0 6px;
  background: var(--dsw-alias-bg-base, #ffffff);
}
.dsh-desk-review-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 1px 8px;
  border: none;
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font: inherit;
  font-size: 11px;
  line-height: 20px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  cursor: pointer;
}
.dsh-desk-review-pill svg {
  width: 14px;
  height: 14px;
  flex: none;
}
.dsh-desk-review-pill[data-active] {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-label-secondary, #6b7280);
}
@media (hover: hover) {
  .dsh-desk-review-pill:hover {
    background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
    color: var(--dsw-alias-label-secondary, #6b7280);
  }
}
/* Square brand-icon button in the official preview header (official Button geometry). */
button.dsh-desk-docreview.dsh-desk-docreview {
  flex: none;
  min-width: 28px;
  padding: 0;
}
`
