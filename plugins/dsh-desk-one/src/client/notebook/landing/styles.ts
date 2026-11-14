/**
 * Annotation landing page styles (official theme aliases only).
 *
 * The hero is the page's primary action; the three aggregates below reuse the compact single-line
 * geometry of the session list, so the page reads as one product with the other tabs.
 */

export const ANNOTATION_CSS = `
.dsh-desk-annotation {
  display: flex;
  flex-direction: column;
  gap: 20px;
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
  padding: 28px 28px 24px;
}
.dsh-desk-annotation-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
  padding: 56px 16px 32px;
}
.dsh-desk-annotation-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsh-desk-annotation-hint {
  margin: 0;
  max-width: 540px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-desk-annotation-primary {
  margin-top: 4px;
  min-height: 40px;
  padding: 0 24px;
  font-size: 14px;
}
.dsh-desk-annotation-loading {
  margin: 0;
  font-size: 13px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-desk-annotation-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dsh-desk-annotation-sectiontitle {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-desk-annotation-total {
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
.dsh-desk-annotation-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.dsh-desk-annotation-row {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) minmax(0, 2fr) auto;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 32px;
  padding: 6px 6px;
  border: none;
  border-bottom: 1px solid var(--dsw-alias-line-1, #e5e7eb);
  background: none;
  text-align: left;
  font-size: 13px;
  color: var(--dsw-alias-label-primary, #1f2329);
  cursor: pointer;
}
.dsh-desk-annotation-row:hover:not(:disabled) {
  background: var(--dsw-alias-bg-hover, #f2f3f5);
}
.dsh-desk-annotation-row:disabled {
  opacity: 0.55;
  cursor: default;
}
.dsh-desk-annotation-rowtitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-desk-annotation-rowmeta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-desk-annotation-rowcount {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
`
