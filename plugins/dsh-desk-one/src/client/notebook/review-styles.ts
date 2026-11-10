/** Note review tab styles: page + annotation threads in the right sidebar. */

export const REVIEW_CSS = `
.dsh-desk-review {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
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
  color: var(--dsw-alias-label-caption, #8a919f);
  font-size: 11px;
}
.dsh-desk-review-notice {
  margin: 0 0 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #4176e6) 10%, transparent);
  color: var(--dsw-alias-state-business-primary, #4176e6);
  font-size: 11px;
}
.dsh-desk-review-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 16px;
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
.dsh-desk-review-mini {
  appearance: none;
  flex: none;
  padding: 2px 8px;
  border: 0.5px solid var(--dsw-alias-border-l2, #d5d9e0);
  border-radius: 7px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 11px;
  cursor: pointer;
}
.dsh-desk-review-mini:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.dsh-desk-review-mini:disabled {
  opacity: 0.5;
  cursor: default;
}
.dsh-desk-review-danger {
  color: #b2352a;
}
.dsh-desk-review-body {
  max-height: 46vh;
  overflow-y: auto;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 13px;
  line-height: 1.7;
}
.dsh-desk-review-composer h4 {
  color: var(--dsw-alias-label-caption, #8a919f);
  font-weight: 500;
}
.dsh-desk-review-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 64px;
  padding: 8px 10px;
  border: 0.5px solid var(--dsw-alias-border-l2, #d5d9e0);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2329);
  font: inherit;
  font-size: 12px;
  resize: vertical;
  outline: none;
}
.dsh-desk-review-input:focus {
  border-color: var(--dsw-alias-brand-primary, #4f7cff);
}
.dsh-desk-review-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 8px;
}
.dsh-desk-review-threadhead {
  display: flex;
  align-items: center;
  gap: 6px;
}
.dsh-desk-review-threadhead h4 {
  margin: 0;
  flex: 1;
}
.dsh-desk-review-thread {
  border-top: 0.5px solid var(--dsw-alias-border-l3, #e2e5ea);
  padding: 8px 0 4px;
  margin-top: 8px;
}
.dsh-desk-review-thread:first-of-type {
  border-top: 0;
  margin-top: 0;
}
.dsh-desk-review-dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dsw-alias-label-caption, #8a919f);
}
.dsh-desk-review-thread[data-status='answered'] .dsh-desk-review-dot {
  background: var(--dsw-alias-state-business-primary, #4176e6);
}
.dsh-desk-review-thread[data-status='resolved'] .dsh-desk-review-dot {
  background: #3a9a5b;
}
.dsh-desk-review-thread[data-status='orphaned'] .dsh-desk-review-dot {
  background: #e2a03c;
}
.dsh-desk-review-anchor {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 11px;
}
.dsh-desk-review-status {
  flex: none;
  color: var(--dsw-alias-label-caption, #8a919f);
  font-size: 10px;
}
.dsh-desk-review-warn {
  margin: 0 0 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, #e2a03c 14%, transparent);
  color: #8a5a00;
  font-size: 11px;
  line-height: 1.6;
}
.dsh-desk-review-hint {
  margin: 4px 0 0;
  color: var(--dsw-alias-label-caption, #8a919f);
  font-size: 10px;
}
.dsh-desk-review-thread-sub {
  margin: 3px 0 0 13px;
  color: var(--dsw-alias-label-caption, #8a919f);
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-desk-review-orphan {
  margin: 4px 0 0;
  color: #8a5a00;
  font-size: 11px;
}
.dsh-desk-review-comment {
  display: flex;
  gap: 6px;
  margin: 6px 0 0;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 12px;
  line-height: 1.6;
}
.dsh-desk-review-comment b {
  flex: none;
  color: var(--dsw-alias-label-caption, #8a919f);
  font-weight: 600;
  font-size: 11px;
}
.dsh-desk-review-comment-ai b {
  color: var(--dsw-alias-state-business-primary, #4176e6);
}
.dsh-desk-review-replybox {
  margin-top: 8px;
}
`
