/** Review tab styles: document view plus the bottom bar, overlay, compose popup and guard. */

export const REVIEW_CSS = `
.dsh-desk-review {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  position: relative;
  height: 100%;
  min-height: 0;
  padding: 12px 14px 0;
  overflow: hidden;
  font-size: 12px;
}
.dsh-desk-review-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 8px;
}
.dsh-desk-review-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 12px;
  font-weight: 600;
}
.dsh-desk-review-kind {
  flex: none;
  padding: 0 5px;
  border-radius: 4px;
  background: var(--dsw-alias-interactive-bg-secondary, rgba(0, 0, 0, 0.06));
  color: var(--dsw-alias-label-caption, #8a919f);
  font-size: 9px;
  letter-spacing: 0.04em;
}
.dsh-desk-review-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 44px;
}
.dsh-desk-review-card {
  border: 0.5px solid var(--dsw-alias-border-l2, #d5d9e0);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--dsw-alias-bg-base, #ffffff);
}
.dsh-desk-review-card h4 {
  margin: 0 0 8px;
  color: var(--dsw-alias-label-primary, #1f2329);
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
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 11px;
}
.dsh-desk-review-body {
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 13px;
  line-height: 1.7;
}
.dsh-desk-review-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--dsw-alias-font-mono, ui-monospace, monospace);
  font-size: 12px;
  line-height: 1.6;
}
.dsh-desk-review-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 0;
  border-top: 0.5px solid var(--dsw-alias-border-l2, #d5d9e0);
  background: var(--dsw-alias-bg-base, #ffffff);
}
.dsh-desk-review-baritem {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font: inherit;
  font-size: 11px;
  text-align: center;
  cursor: pointer;
}
.dsh-desk-review-baritem:hover,
.dsh-desk-review-baritem[data-active='true'] {
  color: var(--dsw-alias-label-primary, #1f2329);
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.04));
}
.dsh-desk-review-layer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 34px;
  z-index: 2;
  max-height: 60%;
  overflow-y: auto;
  padding: 10px 12px;
  border-top: 0.5px solid var(--dsw-alias-border-l2, #d5d9e0);
  background: var(--dsw-alias-bg-elevated, #ffffff);
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.12);
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
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsh-desk-review-pending {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 0;
  border-top: 0.5px solid var(--dsw-alias-border-l2, #d5d9e0);
}
.dsh-desk-review-pending-no {
  flex: none;
  width: 16px;
  color: var(--dsw-alias-label-caption, #8a919f);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.dsh-desk-review-pending-main {
  flex: 1;
  min-width: 0;
}
.dsh-desk-review-pending-text {
  margin: 4px 0 0;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
.dsh-desk-review-quote {
  margin: 0;
  padding: 0 0 0 8px;
  border-left: 2px solid var(--dsw-alias-border-l2, #d5d9e0);
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
.dsh-desk-review-composer {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 42px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 0.5px solid var(--dsw-alias-border-l2, #d5d9e0);
  border-radius: 10px;
  background: var(--dsw-alias-bg-elevated, #ffffff);
  box-shadow: 0 -6px 20px rgba(0, 0, 0, 0.14);
}
.dsh-desk-review-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 64px;
  max-height: 160px;
  padding: 6px 8px;
  border: 0.5px solid var(--dsw-alias-border-l2, #d5d9e0);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  line-height: 1.6;
  resize: vertical;
}
.dsh-desk-review-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}
.dsh-desk-review-blocker {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 42px;
  z-index: 4;
  padding: 10px 12px;
  border: 0.5px solid var(--dsw-alias-border-l2, #d5d9e0);
  border-radius: 10px;
  background: var(--dsw-alias-bg-elevated, #ffffff);
  box-shadow: 0 -6px 20px rgba(0, 0, 0, 0.16);
}
.dsh-desk-review-blocker p {
  margin: 0 0 8px;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 12px;
}
.dsh-desk-review-notice {
  margin: 0 0 8px;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-secondary, rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 11px;
}
.dsh-desk-review-mini {
  flex: none;
  padding: 2px 6px;
  border: 0.5px solid var(--dsw-alias-border-l2, #d5d9e0);
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-caption, #8a919f);
  font-size: 10px;
  cursor: pointer;
}
.dsh-desk-review-mini:hover {
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsh-desk-review-danger {
  border-color: var(--dsw-alias-state-error, #c0503f);
  color: var(--dsw-alias-state-error, #c0503f);
}
.dsh-desk-review-diffadded {
  color: #3a9a5b;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.dsh-desk-review-diffremoved {
  color: #c0503f;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
`
