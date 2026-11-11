/** Review tab styles: the page under review (read-only document view). */

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
.dsh-desk-review-body {
  max-height: 62vh;
  overflow-y: auto;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 13px;
  line-height: 1.7;
}
.dsh-desk-review-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 8px;
}
`
