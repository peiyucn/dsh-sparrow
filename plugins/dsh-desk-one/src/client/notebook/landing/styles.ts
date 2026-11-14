/**
 * Annotation landing page styles: the same compact, card-based vocabulary as the Sessions tab.
 * The start card carries the only primary action; the three aggregate sections reuse the session
 * section head and card frame, so the page reads as one product with the other tabs.
 */

export const ANNOTATION_CSS = `
.dsh-desk-annotation {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: calc(var(--dsh-desk-header-h) + 16px) clamp(20px, 3vw, 40px) 16px;
}
.dsh-desk-annotation > * {
  box-sizing: border-box;
  width: 100%;
  max-width: min(1100px, 100%);
  margin-left: auto;
  margin-right: auto;
}
.dsh-desk-annotation-start {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  padding: 12px 14px;
}
.dsh-desk-annotation-starthint {
  flex: 1 1 260px;
  min-width: 0;
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-desk-annotation-startaction {
  flex: none;
}
.dsh-desk-annotation-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.dsh-desk-annotation-row {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) minmax(0, 2fr) auto;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 32px;
  padding: 6px 10px;
  border: 0;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  background: none;
  text-align: left;
  font: inherit;
  font-size: 13px;
  color: var(--dsw-alias-label-primary, #1f2329);
  cursor: pointer;
}
.dsh-desk-annotation-list li:last-child .dsh-desk-annotation-row {
  border-bottom: 0;
}
.dsh-desk-annotation-row:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
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
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
`
